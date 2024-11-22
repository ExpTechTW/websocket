const WebSocket = require("ws");

const logger = require("./utils/logger");

class Server {
  static instance;

  constructor(urls) {
    if (Server.instance)
      return Server.instance;


    this.urls = urls;
    this.ws = null;

    this.connect();

    Server.instance = this;
  }

  connect() {
    const url = this.urls[Math.floor(Math.random() * this.urls.length)];
    this.ws = new WebSocket(`wss://${url}/websocket`);
    this.ws_event();
  }

  ws_event() {
    this.ws.onclose = () => {
      this.ws = null;
      logger.info("WebSocket connection closed");
    };

    this.ws.onerror = (error) => {
      logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      logger.info("WebSocket connection established");
    };

    this.ws.onmessage = (evt) => {
      logger.debug("Received message:", evt.data);
    };
  }
}

module.exports = Server;