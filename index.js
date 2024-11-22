const config = require("./src/config");

class Plugin {
  static instance = null;

  #ctx;
  #config;
  #logger;

  constructor(ctx) {
    if (Plugin.instance)
      return Plugin.instance;


    this.#ctx = ctx;
    this.#config = new config(this.#ctx.info.pluginDir);
    this.config = {};
    this.logger = null;

    Plugin.instance = this;
  }

  static getInstance() {
    if (!Plugin.instance)
      throw new Error("Plugin not initialized");

    return Plugin.instance;
  }

  onLoad() {
    const { TREM, Logger, MixinManager } = this.#ctx;

    this.config = this.#config.getConfig();

    const { CustomLogger } = require("./src/utils/logger").createCustomLogger(Logger);
    this.logger = new CustomLogger("websocket");

    const server = require("./src/server");
    new server(this.config.server);
  }
}

module.exports = Plugin;