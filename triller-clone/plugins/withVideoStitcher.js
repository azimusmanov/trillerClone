const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

module.exports = function withVideoStitcher(config) {
  // 1. Copy the .m file into ios/<ProjectName>/ at prebuild time
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const projectName = config.modRequest.projectName;
      const src  = path.join(config.modRequest.projectRoot, 'native', 'VideoStitcher.m');
      const dest = path.join(projectRoot, projectName, 'VideoStitcher.m');
      fs.copyFileSync(src, dest);
      return config;
    },
  ]);

  // 2. Register the file in the .xcodeproj so Xcode compiles it
  config = withXcodeProject(config, (config) => {
    const project     = config.modResults;
    const projectName = config.modRequest.projectName;
    const filePath    = `${projectName}/VideoStitcher.m`;

    if (!project.hasFile(filePath)) {
      const groupKey = project.findPBXGroupKey({ name: projectName });
      project.addSourceFile(filePath, { target: project.getFirstTarget().uuid }, groupKey);
    }

    return config;
  });

  return config;
};
