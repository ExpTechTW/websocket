const config = require("./src/config");

class Plugin {
  static instance = null;

  #ctx;
  #config;

  constructor(ctx) {
    if (Plugin.instance)
      return Plugin.instance;

    this.#ctx = ctx;
    this.#config = new config(this.#ctx.info.pluginDir);
    this.config = {};

    Plugin.instance = this;
  }

  static getInstance() {
    if (!Plugin.instance)
      new Plugin();

    return Plugin.instance;
  }

  onLoad() {
    const { TREM, logger, MixinManager } = this.#ctx;

    this.config = this.#config.getConfig();

    // TREM.variable.play_mode = 1;
  }
}

module.exports = Plugin;
