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