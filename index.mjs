import path from "node:path";
import { existsSync, createReadStream, createWriteStream, unlink } from "node:fs";
import { readdir, stat, mkdir } from "node:fs/promises";
import ncp from "ncp";
import { rimraf } from "rimraf";

import { ROOT_DIR_PATH as fromFolderTarget, DESTINATION_DIR_PATH as destinationFolderTarget, SOUVENIR } from "./config.mjs";

if (typeof fromFolderTarget !== "string" || fromFolderTarget.length <= 0) {
  throw new Error("SOURCE folder is mandatory.");
};

if (typeof destinationFolderTarget !== "string" || destinationFolderTarget.length <= 0) {
  throw new Error("TARGET folder is mandatory.");
};

async function initiate() {
  const firstTimeRecord = performance.now();

  const rootDirectories = await readdir(fromFolderTarget);
  if (!rootDirectories?.length) {
    throw new Error("No directories available.");
  };

  // read NVIDIA Shadowplay directory
  for await (const rootDirectoryName of rootDirectories) {
    const rootDirectoryPath = path.join(fromFolderTarget, rootDirectoryName);

    // if it's not a folder, skip it
    const rootDirectoryStat = await stat(rootDirectoryPath);
    if (!rootDirectoryStat.isDirectory()) {
      console.warn(`Skipped a directory named [${rootDirectoryName}] because is not a directory.`);
      continue;
    };

    // read content inside the directory
    const directories = await readdir(rootDirectoryPath);
    if (!directories?.length) {
      console.warn(`Skipped a directory named [${rootDirectoryName}] because it's empty.`);
      continue;
    };

    // start the process of migration
    for await (const contentName of directories) {
      const contentPath = path.join(rootDirectoryPath, contentName);
      const destinationPath = path.join(destinationFolderTarget, rootDirectoryName);

      // if its a directory, move it to "projects" directory
      const contentStat = await stat(contentPath);
      if (typeof SOUVENIR.projects === "string" && SOUVENIR.projects.length > 0 && contentStat.isDirectory()) {
        // if the destination folder doesn't have a "projects" folder, create it
        const projectsDestinationPath = path.join(destinationPath, SOUVENIR.projects);
        if (!existsSync(projectsDestinationPath)) {
          await mkdir(projectsDestinationPath, { recursive: true });
        };

        const newPath = path.join(projectsDestinationPath, contentName);

        await new Promise((resolve, reject) => {
          ncp.ncp(contentPath, newPath, { clobber: false, stopOnErr: true, limit: 16 }, function(error) {
            if (error) return reject(error);

            resolve();
          });
        });

        await rimraf(contentPath, { glob: false });

        console.log(`Successfully moved [${contentName}] to ${newPath}`);

        continue;
      };

      // if the content is a screenshot (usually ended with .jpeg or .png (mostly)), move it to "screenshots" directory
      if (typeof SOUVENIR.screenshots === "string" && SOUVENIR.screenshots.length > 0 && (contentName.endsWith(".png") || contentName.endsWith(".jpeg") || contentName.endsWith(".jpg"))) {
        // if the destination folder doesn't have a "screenshots" folder, create it
        const screenshotsDestinationPath = path.join(destinationPath, SOUVENIR.screenshots);
        if (!existsSync(screenshotsDestinationPath)) {
          await mkdir(screenshotsDestinationPath, { recursive: true });
        };

        const newPath = path.join(screenshotsDestinationPath, contentName);

        await rename(contentPath, newPath);

        console.log(`Successfully moved [${contentName}] to ${newPath}`);
        
        continue;
      };

      // if the content is not a video, skip
      if (!contentName.endsWith(".mp4")) {
        console.warn(`Skipped ${contentName} because the file is not a video.`);
        continue;
      };

      // if the destination folder doesn't have a "footages" folder, create it
      const footagesDestinationPath = (typeof SOUVENIR.footages === "string" || SOUVENIR.footages.length > 0) ?
        path.join(destinationPath, SOUVENIR.footages) :
        destinationPath;
      
      if (!existsSync(footagesDestinationPath)) {
        await mkdir(footagesDestinationPath, { recursive: true });
      };

      // inside the footages folder, here i'll separate the video by date and time
      // NVIDIA Shadowplay surely provide this in the file names
      // Valorant 2024.01.05 - 21.11.01.02.mp4  ----->  2024.01.05
      const folderNameWithDate = contentName.match(/\d{4}\.\d{2}\.\d{2}/gim);
      if (!Array.isArray(folderNameWithDate)) {
        console.warn(`Skipped ${contentName} because the file doesn't contain any date to parse with.`);
        continue;
      };

      const separatedFootagesDestinationPath = path.join(footagesDestinationPath, folderNameWithDate[0]);
      if (!existsSync(separatedFootagesDestinationPath)) {
        await mkdir(separatedFootagesDestinationPath);
      };

      const newPath = path.join(separatedFootagesDestinationPath, contentName);
      await rename(contentPath, newPath);
      
      console.log(`Successfully moved [${contentName}] to ${newPath}`);
    };
  };

  return console.log(`Migration finished in [${Number(performance.now() - firstTimeRecord).toFixed(1)} ms]`);
};

// copied from https://www.npmjs.com/package/mv
async function rename(source, destination) {
  return new Promise((resolve, reject) => {
    const sourceStream = createReadStream(source);
    const destinationStream = createWriteStream(destination, { flags: "wx" });

    const onClose = () => {
      unlink(source, (error) => {
        if (error !== null) return reject();
        
        resolve();
      });
    };

    const streamErrorHandler = (error) => {
      sourceStream.destroy();
      destinationStream.destroy();

      destinationStream.removeListener('close', onClose);
      return reject(error);
    };

    sourceStream.on('error', streamErrorHandler);

    destinationStream.on('error', streamErrorHandler);

    sourceStream.pipe(destinationStream);

    destinationStream.once('close', onClose);
  });
};

initiate();