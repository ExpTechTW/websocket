const WebSocket = require("ws");

const logger = require("./utils/logger");

const Config = require("./utils/config");

const config = new Config();

class Server {
  static instance;

  constructor(urls) {
    if (Server.instance)
      return Server.instance;


    this.urls = urls;
    this.ws = null;
    this.reconnect = true;

    this.config = config.getConfig();

    this.wsConfig = {
      type    : "start",
      service : this.config.service,
      key     : "",
    };

    this.connect();

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
          }
          break;
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
}

module.exports = Server;