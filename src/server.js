const WebSocket = require("ws");

const logger = require("./utils/logger");

class Server {
  static instance;

  constructor(urls, config, exptech_config, TREM, MixinManager) {
    if (Server.instance)
      return Server.instance;


    this.urls = urls;
    this.ws = null;
    this.reconnect = true;

    this.config = config;
    this.exptech_config = exptech_config;
    this.get_exptech_config = this.exptech_config.getConfig();
    this.TREM = TREM;
    this.TREM.variable.events.on('MapLoad', () => {
      setInterval(async () => {
        await this.fetchData();
      }, 0);
    });
    this.DataManager = this.TREM.class.DataManager.getInstance();

    let rts = null, eew = null, intensity = null, lpgm = null, tsunami = null, report = null, rtw = null;
    this.data = { rts, eew, intensity, lpgm, tsunami, report, rtw };

    this.wsConfig = {
      type    : "start",
      service : this.config.service,
      key     : this.get_exptech_config.user.token ?? "",
    };

    this.connect();
    this.ws_time = 0;

    setInterval(() => {
      if ((Date.now() - this.ws_time > 30_000 && this.ws_time != 0)) {
        this.connect();
      }
    }, 3000);

    // MixinManager.inject(TREM.class.DataManager, "fetchData", this.fetchData, "start");

    Server.instance = this;
  }

  connect() {
    if (!this.reconnect) return;
    if (this.ws) this.ws.terminate();
    this.ws = null;
    const url = `wss://${this.urls[Math.floor(Math.random() * this.urls.length)]}/websocket`;
    this.ws = new WebSocket(url);
    logger.info("websocket connecting to -> ", url);
    this.ws_event();
  }

  ws_event() {
    this.ws.onclose = () => {
      this.ws = null;
      logger.info("WebSocket close");

      setTimeout(this.connect, 3000);
    };

    this.ws.onerror = (error) => {
      logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      logger.info("WebSocket open");

      this.send(this.wsConfig);
    };

    this.ws.onmessage = (evt) => {
      const json = JSON.parse(evt.data);

      switch (json.type) {
        case "verify":{
          this.send(this.wsConfig);
          break;
        }
        case "info":{
          if (json.data.code == 401) {
            this.reconnect = false;
            logger.info("WebSocket close -> 401");
            this.ws.close();
          } else if (json.data.code == 200) {
            this.ws_time = Date.now();
          } else if (json.data.code == 400) {
            this.send(this.wsConfig);
          }
          // logger.info("Received message:", json.data);
          // break;
        }
        case "data":{
          this.TREM.variable.play_mode = 1;
          switch (json.data.type) {
            case "rts":
              this.data.rts = json.data.data;
              break;
            case "tsunami":
							this.data.tsunami = json.data.data;
							// break;
						case "eew":
							this.data.eew = json.data.data;
							// break;
						case "intensity":
							this.data.intensity = json.data.data;
							// break;
						case "report":
							this.data.report = json.data.data;
							// break;
						case "rtw":
							this.data.rtw = json.data.data;
							break;
            case "lpgm":
              this.data.lpgm = json.data.data;
              // break;
            default:
              logger.info("Received message:", json);
          }
          break;
        }
        case "ntp":{
          this.ws_time = json.time;
        }
        default:{
          logger.info("Received message:", json);
        }
      }
    };
  }

  send(data) {
    if (this.ws) this.ws.send(JSON.stringify(data));
  }

  async fetchData() {
    if (TREM.variable.play_mode === 1) {
      // realtime (websocket)
      const localNow_ws = Date.now();
      if (localNow_ws - this.lastFetchTime < 100) {
        return;
      }
      this.lastFetchTime = localNow_ws;

      if (!TREM.variable.data.rts
        || (!this.data.rts && ((localNow_ws - TREM.variable.cache.last_data_time) > TREM.constant.LAST_DATA_TIMEOUT_ERROR))
        || TREM.variable.data.rts.time < (this.data.rts?.time ?? 0)) {
        TREM.variable.data.rts = this.data.rts;
        TREM.variable.events.emit('DataRts', {
          info: { type: TREM.variable.play_mode },
          data: this.data.rts,
        });
      }

      if (this.data.eew) {
        this.DataManager.processEEWData(data.eew);
      }
      else {
        this.DataManager.processEEWData();
      }

      if (this.data.intensity) {
        this.DataManager.processIntensityData(this.data.intensity);
      }

      if (this.data.lpgm) {
        this.DataManager.processLpgmData(this.data.lpgm);
      }

      if (this.data.rts) {
        TREM.variable.cache.last_data_time = localNow_ws;
      }

      return null;
    }
  }
}

module.exports = Server;