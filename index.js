const config = require("../config/config");

class Plugin {
  static instance = null;

  #ctx;
  #config;
  #exptech_config;
  #server;

  constructor(ctx) {
    if (Plugin.instance) return Plugin.instance;

    this.#ctx = ctx;
    this.#config = null;
    this.config = {};
    this.#exptech_config = null;
    this.exptech_config = {};
    this.logger = null;
    this.#server = null;

    Plugin.instance = this;
  }

  static getInstance() {
    if (!Plugin.instance) throw new Error("Plugin not initialized");

    return Plugin.instance;
  }

  onLoad() {
    const { TREM, Logger, info, utils, MixinManager } = this.#ctx;

    const { CustomLogger } =
      require("../logger/logger").createCustomLogger(Logger);
    this.logger = new CustomLogger("websocket");

    const defaultDir = utils.path.join(info.pluginDir, "./websocket/resource/default.yml");
    const configDir = utils.path.join(info.pluginDir, "./websocket/config.yml");

    this.#config = new config("websocket", this.logger, utils.fs, defaultDir, configDir);
    this.config = this.#config.getConfig();

    const exptech_defaultDir = utils.path.join(info.pluginDir, "./exptech/resource/default.yml");
    const exptech_configDir = utils.path.join(info.pluginDir, "./exptech/config.yml");

    this.#exptech_config = new config("exptech_websocket", this.logger, utils.fs, exptech_defaultDir, exptech_configDir);
    this.exptech_config = this.#exptech_config.getConfig();

    const server = require("./src/server");
    this.#server = new server(this.logger, this.config.server, this.config, this.#exptech_config, TREM, MixinManager);
  }
}

module.exports = Plugin;
