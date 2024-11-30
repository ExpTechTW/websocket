const fs = require("fs-extra");
const yaml = require("js-yaml");

const path = require("path");

class config {
  static instance = null;

  constructor(ctx) {
    if (config.instance) return config.instance;

    this.default_config = {};
    this.config = {};

    const pluginDir = ctx.info.originalPath;
    this.defaultDir = path.join(pluginDir, "./resource/default.yml");
    this.configDir = path.join(pluginDir, "./config.yml");

    this.checkConfigExists();
    this.readDefaultYaml();
    this.readConfigYaml();
    this.checkConfigVersion();

    config.instance = this;
  }

  static getInstance() {
    if (!config.instance) new config();

    return config.instance;
  }

  checkConfigExists() {
    if (!fs.existsSync(this.configDir))
      fs.copySync(this.defaultDir, this.configDir);
  }

  readDefaultYaml() {
    const raw = fs.readFileSync(this.defaultDir).toString();
    this.default_config = yaml.load(raw);
  }

  readConfigYaml() {
    const raw = fs.readFileSync(this.configDir).toString();
    this.config = yaml.load(raw);
  }

  checkConfigVersion() {
    if (this.default_config.ver > this.config.ver) {
      let configContent = fs.readFileSync(this.defaultDir, "utf8");
      const lines = configContent.split("\n");

      const newConfig = { ...this.default_config };
      if (this.config.user)
        newConfig.user = { ...newConfig.user, ...this.config.user };

      const newLines = [];
      let currentKey = "";
      const processedArrays = new Set();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const keyMatch = line.match(/^(\w+):/);
        const indentedKeyMatch = line.match(/^\s+(\w+):/);

        if (keyMatch) {
          currentKey = keyMatch[1];
          const value = newConfig[currentKey];

          const comment = line.includes("#") ? line.split("#")[1].trim() : "";
          const commentPart = comment ? ` # ${comment}` : "";

          if (Array.isArray(value)) {
            if (!processedArrays.has(currentKey)) {
              newLines.push(`${currentKey}:${commentPart}`);
              value.forEach((item) => {
                newLines.push(`  - ${item}`);
              });
              processedArrays.add(currentKey);
            }
          } else if (typeof value === "object" && value !== null)
            newLines.push(`${currentKey}:${commentPart}`);
          else
            newLines.push(`${currentKey}: ${value === null ? "null" : value}${commentPart}`);
        } else if (indentedKeyMatch) {
          const subKey = indentedKeyMatch[1];
          if (
            newConfig[currentKey] &&
            typeof newConfig[currentKey][subKey] !== "undefined"
          ) {
            const value = newConfig[currentKey][subKey];
            const comment = line.includes("#") ? line.split("#")[1].trim() : "";
            const commentPart = comment ? ` # ${comment}` : "";
            newLines.push(`  ${subKey}: ${value === null ? "null" : value}${commentPart}`);
          }
        }
      }

      configContent = newLines.join("\n");

      fs.writeFileSync(this.configDir, configContent);

      this.config = newConfig;
      console.log("設定檔已更新至最新版本");
    }
  }

  getConfig() {
    return this.config;
  }
}

module.exports = config;
