const WebSocket = require("../node_modules/ws/index");

class Server {
  static instance;

  constructor(logger, urls, config, exptech_config, TREM, MixinManager) {
    if (Server.instance)
      return Server.instance;

    this.logger = logger;
    this.urls = urls;
    this.ws = null;
    this.reconnect = true;
    this.info_get = false;
    this.ws_gg = false;

    this.config = config;
    this.exptech_config = exptech_config;
    this.get_exptech_config = this.exptech_config.getConfig();
    this.TREM = TREM;
    // this.TREM.variable.events.on('MapLoad', () => {
    //   setInterval(async () => {
    //     await this.fetchData();
    //   }, 0);
    // });

    const rts = null, eew = null, intensity = null, lpgm = null, tsunami = null, report = null, rtw = null;
    this.data = { rts, eew, intensity, lpgm, tsunami, report, rtw };

    this.wsConfig = {
      type    : "start",
      service : this.config.service,
      key     : this.get_exptech_config.user.token ?? "",
    };

    this.connect();
    this.ws_time = 0;

    setInterval(() => {
      if (this.ws_gg)
        this.connect();
      else if ((Date.now() - this.ws_time > 30_000 && this.ws_time != 0))
        this.connect();

    }, 3000);

    setInterval(async () => {
      await this.fetchData();
    }, 0);

    // MixinManager.inject(TREM.class.DataManager, "fetchData", this.fetchData, "start");

    this.requestCounter = 0;
    this.activeRequests = [];

    Server.instance = this;
  }

  connect() {
    if (!this.reconnect) return;
    if (this.ws) this.ws.terminate();
    this.ws = null;
    const url = `wss://${this.urls[Math.floor(Math.random() * this.urls.length)]}/websocket`;
    this.ws = new WebSocket(url);
    this.logger.info("websocket connecting to -> ", url);
    this.ws_event();
  }

  ws_event() {
    this.ws.onclose = () => {
      this.ws_gg = true;
      this.logger.warn("WebSocket close");

      // setTimeout(this.connect, 3000);
    };

    this.ws.onerror = (error) => {
      this.ws_gg = true;
      this.logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      this.ws_gg = false;
      this.logger.info("WebSocket open");

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
            this.logger.info("WebSocket close -> 401");
            this.ws.close();
          } else if (json.data.code == 200) {
            this.ws_time = Date.now();
            if (!this.info_get) {
              this.info_get = true;
              this.logger.info("info:", json.data);

              if (json.data.list.includes("trem.eew")) {
                const eewSource = JSON.parse(localStorage.getItem("eew-source-plugin")) || [];
                if (eewSource.includes("trem")) this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter(author => author != "cwa");
                this.logger.info("EEW_AUTHOR:", this.TREM.constant.EEW_AUTHOR);
              }
            }
          } else if (json.data.code == 400)
            this.send(this.wsConfig);

          break;
        }
        case "data":{
          if (this.TREM.variable.play_mode === 0) this.TREM.variable.play_mode = 1;
          switch (json.data.type) {
            case "rts":
              this.ws_time = Date.now();
              this.data.rts = json.data.data;
              if (this.TREM.variable.play_mode === 1) {
                this.TREM.variable.data.rts = this.data.rts;
                this.TREM.variable.events.emit("DataRts", {
                  info : { type: this.TREM.variable.play_mode },
                  data : this.data.rts,
                });
                this.TREM.variable.cache.last_data_time = this.ws_time;
                if (this.data.rts.int.length == 0) {
                  this.processEEWData();
                  this.processIntensityData();
                  this.processLpgmData();
                }
              }
              break;
            case "tsunami":
              this.data.tsunami = json.data;
              break;
            case "eew":
              this.logger.info("data eew:", json.data);
              this.data.eew = json.data;
              if (this.TREM.variable.play_mode === 1) this.processEEWData(this.data.eew);
              break;
            case "intensity":
              this.logger.info("data intensity:", json.data);
              this.data.intensity = json.data;
              if (this.TREM.variable.play_mode === 1) this.processIntensityData(this.data.intensity);
              break;
            case "report":
              this.data.report = json.data;
              break;
            case "rtw":
              this.data.rtw = json.data;
              break;
            case "lpgm":
              this.logger.info("data lpgm:", json.data);
              this.data.lpgm = json.data;
              if (this.TREM.variable.play_mode === 1) this.processLpgmData(this.data.lpgm);
              break;
            default:
              this.logger.info("data:", json.data);
          }
          break;
        }
        case "ntp":{
          this.ws_time = Date.now();
          break;
        }
        default:{
          this.logger.info("json:", json);
        }
      }
    };
  }

  send(data) {
    if (this.ws) this.ws.send(JSON.stringify(data));
  }

  abortAll() {
    if (this.activeRequests.length > 0) {
      this.activeRequests.forEach((fetcher) => fetcher.controller.abort());
      this.activeRequests = [];
    }
  }

  getFetchData(url, timeout = 1000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return {
      execute: async () => {
        try {
          const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          if (error.name === "AbortError")
            this.logger.error(`[utils/fetch.js] -> time out | ${url}`);

          else
            this.logger.error(`[utils/fetch.js] -> fetch error: ${url} | ${error.message}`);

          return null;
        }
      },
      controller,
    };
  }

  async http(time) {
    time = Math.round(time / 1000);
    this.requestCounter++;
    const shouldFetchLPGM = this.requestCounter % 10 === 0;
    const shouldFetchIntensity = this.requestCounter % 5 === 0;

    const url = (time)
      ? this.TREM.constant.URL.REPLAY[Math.floor(Math.random() * this.TREM.constant.URL.REPLAY.length)]
      : this.TREM.constant.URL.LB[Math.floor(Math.random() * this.TREM.constant.URL.LB.length)];

    const eew_req = this.getFetchData(
      `https://${url}/api/v2/eq/eew${(time) ? `/${time}` : ""}`,
      this.TREM.constant.HTTP_TIMEOUT.EEW,
    );

    const activeReqs = [eew_req];
    let intensity_req, lpgm_req;

    if (shouldFetchIntensity) {
      intensity_req = this.getFetchData(
        `https://${this.TREM.constant.URL.API[1]}/api/v2/trem/intensity${(time) ? `/${time}` : ""}`,
        this.TREM.constant.HTTP_TIMEOUT.INTENSITY,
      );
      activeReqs.push(intensity_req);
    }

    if (shouldFetchLPGM) {
      lpgm_req = this.getFetchData(
        `https://${this.TREM.constant.URL.API[1]}/api/v2/trem/lpgm${(time) ? `/${time}` : ""}`,
        this.TREM.constant.HTTP_TIMEOUT.LPGM,
      );
      activeReqs.push(lpgm_req);
    }

    this.activeRequests.push(...activeReqs);

    try {
      const responses = await Promise.all(activeReqs.map((req) => req.execute()));

      let eew = null, intensity = null, lpgm = null;

      if (responses[0]?.ok)
        eew = await responses[0].json();


      if (shouldFetchIntensity && responses[1]?.ok)
        intensity = await responses[1].json();


      if (shouldFetchLPGM && responses[responses.length - 1]?.ok)
        lpgm = await responses[responses.length - 1].json();


      return { eew, intensity, lpgm };
    } finally {
      this.activeRequests = this.activeRequests.filter((req) => !activeReqs.includes(req));
    }
  }

  async fetchData() {
    if (this.TREM.variable.play_mode === 1) {
      // realtime (websocket)
      const localNow_ws = Date.now();
      if (localNow_ws - this.lastFetchTime < 1000)
        return;

      this.lastFetchTime = localNow_ws;

      const data = await this.http(null);

      // if (!this.TREM.variable.data.rts
      //   || (!this.data.rts && ((localNow_ws - this.TREM.variable.cache.last_data_time) > this.TREM.constant.LAST_DATA_TIMEOUT_ERROR))
      //   || this.TREM.variable.data.rts.time < (this.data.rts?.time ?? 0)) {
      //   this.TREM.variable.data.rts = this.data.rts;
      //   this.TREM.variable.events.emit('DataRts', {
      //     info: { type: this.TREM.variable.play_mode },
      //     data: this.data.rts,
      //   });
      // }

      if (data.eew)
        this.processEEWData(data.eew);

      else
        this.processEEWData();


      if (data.intensity)
        this.processIntensityData(data.intensity);

      else
        this.processIntensityData();


      if (data.lpgm)
        this.processLpgmData(data.lpgm);

      else
        this.processLpgmData();


      // if (this.data.rts) {
      //   this.TREM.variable.cache.last_data_time = localNow_ws;
      // }

      return null;
    } else
      this.abortAll();

  }

  processEEWData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 240 * 1000;
    const STATUS_3_TIMEOUT = 30 * 1000;

    this.TREM.variable.data.eew
      .filter((item) =>
        item.eq?.time && (
          currentTime - item.eq.time > EXPIRY_TIME
          || item.EewEnd
          || (item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT)
        ),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit("EewEnd", {
          info : { type: this.TREM.variable.play_mode },
          data : { ...data, EewEnd: true },
        });
      });

    this.TREM.variable.data.eew = this.TREM.variable.data.eew.filter((item) =>
      item.eq?.time
      && currentTime - item.eq.time <= EXPIRY_TIME
      && !item.EewEnd
      && !(item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT),
    );

    if (!data.eq?.time || currentTime - data.eq.time > EXPIRY_TIME || data.EewEnd)
      return;


    const existingIndex = this.TREM.variable.data.eew.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1)
      if (!this.TREM.variable.cache.eew_last[data.id]) {
        if (this.TREM.constant.EEW_AUTHOR.includes(data.author)) {
          this.TREM.variable.cache.eew_last[data.id] = {
            last_time : currentTime,
            serial    : 1,
          };
          this.TREM.variable.data.eew.push(data);
          this.TREM.variable.events.emit("EewRelease", eventData);
        }
        return;
      }


    if (this.TREM.variable.cache.eew_last[data.id] && this.TREM.variable.cache.eew_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.eew_last[data.id].serial = data.serial;

      if (data.status === 3)
        data.status3Time = currentTime;


      this.TREM.variable.events.emit("EewUpdate", eventData);

      if (!this.TREM.variable.data.eew[existingIndex].status && data.status == 1)
        this.TREM.variable.events.emit("EewAlert", eventData);


      this.TREM.variable.data.eew[existingIndex] = data;
    }

    this.cleanupCache("eew_last");

    this.TREM.variable.events.emit("DataEew", {
      info : { type: this.TREM.variable.play_mode },
      data : this.TREM.variable.data.eew,
    });
  }

  processIntensityData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 600 * 1000;

    this.TREM.variable.data.intensity
      .filter((item) =>
        item.id
        && (currentTime - item.id > EXPIRY_TIME || item.IntensityEnd),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit("IntensityEnd", {
          info : { type: this.TREM.variable.play_mode },
          data : { ...data, IntensityEnd: true },
        });
      });

    this.TREM.variable.data.intensity = this.TREM.variable.data.intensity.filter((item) =>
      item.id
      && currentTime - item.id <= EXPIRY_TIME
      && !item.IntensityEnd,
    );

    if (!data.id || currentTime - data.id > EXPIRY_TIME || data.IntensityEnd)
      return;


    const existingIndex = this.TREM.variable.data.intensity.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1)
      if (!this.TREM.variable.cache.intensity_last[data.id]) {
        this.TREM.variable.cache.intensity_last[data.id] = {
          last_time : currentTime,
          serial    : 1,
        };
        this.TREM.variable.data.intensity.push(data);
        this.TREM.variable.events.emit("IntensityRelease", eventData);
        return;
      }


    if (this.TREM.variable.cache.intensity_last[data.id] && this.TREM.variable.cache.intensity_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.intensity_last[data.id].serial = data.serial;
      if (this.isAreaDifferent(data.area, this.TREM.variable.data.intensity[existingIndex].area)) {
        this.TREM.variable.events.emit("IntensityUpdate", eventData);
        this.TREM.variable.data.intensity[existingIndex] = data;
      }
    }

    this.cleanupCache("intensity_last");

    this.TREM.variable.events.emit("DataIntensity", {
      info : { type: this.TREM.variable.play_mode },
      data : this.TREM.variable.data.intensity,
    });
  }

  processLpgmData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 600 * 1000;

    this.TREM.variable.data.lpgm
      .filter((item) =>
        item.time
        && (currentTime - item.time > EXPIRY_TIME || item.LpgmEnd),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit("LpgmEnd", {
          info : { type: this.TREM.variable.play_mode },
          data : { ...data, LpgmEnd: true },
        });
      });

    this.TREM.variable.data.lpgm = this.TREM.variable.data.lpgm.filter((item) =>
      item.time
      && currentTime - item.time <= EXPIRY_TIME
      && !item.LpgmEnd,
    );

    if (!data.id || data.LpgmEnd)
      return;


    const existingIndex = this.TREM.variable.data.lpgm.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1) {
      data.id = Number(data.id);
      data.time = this.now();
      this.TREM.variable.data.lpgm.push(data);
      this.TREM.variable.events.emit("LpgmRelease", eventData);
    }

    this.TREM.variable.events.emit("DataLpgm", {
      info : { type: this.TREM.variable.play_mode },
      data : this.TREM.variable.data.lpgm,
    });
  }

  cleanupCache(cacheKey) {
    const currentTime = this.now();
    Object.keys(this.TREM.variable.cache[cacheKey]).forEach((id) => {
      const item = this.TREM.variable.cache[cacheKey][id];
      if (currentTime - item.last_time > 600000)
        delete this.TREM.variable.cache[cacheKey][id];

    });
  }

  isAreaDifferent(area1, area2) {
    if (!area1 || !area2)
      return true;


    const keys1 = Object.keys(area1);
    const keys2 = Object.keys(area2);

    if (keys1.length !== keys2.length)
      return true;


    return keys1.some((key) => {
      const arr1 = area1[key] || [];
      const arr2 = area2[key] || [];
      if (arr1.length !== arr2.length)
        return true;

      return !arr1.every((val) => arr2.includes(val));
    });
  }

  now() {
    if (this.TREM.variable.play_mode == 2 || this.TREM.variable.play_mode == 3) {
      if (!this.TREM.variable.replay.local_time)
        this.TREM.variable.replay.local_time = Date.now();


      return this.TREM.variable.replay.start_time + (Date.now() - this.TREM.variable.replay.local_time);
    }

    if (!this.TREM.variable.cache.time.syncedTime || !this.TREM.variable.cache.time.lastSync)
      return Date.now();


    const offset = Date.now() - this.TREM.variable.cache.time.lastSync;
    return this.TREM.variable.cache.time.syncedTime + offset;
  }
}

module.exports = Server;