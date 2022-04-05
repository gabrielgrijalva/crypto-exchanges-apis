const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const wait = require('../_utils/wait');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * 
 * @param {mysql.Connection} connection 
 * @param {import('../../typings/_rest').getCandlesResponseData} candles 
 */
function saveCandles(connection, candles, table) {
  return new Promise((resolve) => {
    const query = `INSERT INTO ${table} (timestamp, open, high, low, close, volume)
    VALUES ? ON DUPLICATE KEY UPDATE timestamp = timestamp`;
    const queryCandles = candles.map(v => [v.timestamp, v.open, v.high, v.low, v.close, v.volume]);
    connection.query(query, [queryCandles], (err) => {
      if (err) { throw err };
      resolve();
    });
  });
};
/**
 * 
 * 
 * 
 * =================================
 * POPULATOR DEFINITION
 * =================================
 * 
 * 
 * 
 */
/** 
 * @this import('../../typings/index')
 * @param {import('../../typings/_populator').populatorSettings} populatorSettings
 */
function Populator(populatorSettings) {
  // Default populator populatorSettings values
  populatorSettings.PORT = populatorSettings.PORT || 3306;
  populatorSettings.HOST = populatorSettings.HOST || 'localhost';
  populatorSettings.USER = populatorSettings.USER || 'root';
  populatorSettings.DATABASE = populatorSettings.DATABASE || '';
  populatorSettings.PASSWORD = populatorSettings.PASSWORD || '';
  populatorSettings.TIMEZONE = populatorSettings.TIMEZONE || '';
  // Create database connection
  const connection = mysql.createConnection({
    port: populatorSettings.PORT,
    host: populatorSettings.HOST,
    user: populatorSettings.USER,
    database: populatorSettings.DATABASE,
    password: populatorSettings.PASSWORD,
    timezone: populatorSettings.TIMEZONE,
  });
  /**
   * 
   * 
   * @type {import('../../typings/_populator').Populator}
   * 
   * 
   */
  const populator = {
    candles: async (params) => {
      const table = params.table;
      const interval = params.interval;
      let start = moment.utc(params.start);
      const finish = moment.utc(params.finish);
      while (start.unix() < finish.unix()) {
        const candles = (await params.rest.getCandles({
          symbol: params.symbol,
          start: start.format('YYYY-MM-DD HH:mm:ss'),
          interval: interval,
        })).data;
        if (candles.length) {
          console.log(candles[0].timestamp);
          const finishIndex = candles.findIndex(v => v.timestamp
            === finish.format('YYYY-MM-DD HH:mm:ss'));
          if (finishIndex !== -1) {
            candles.splice(finishIndex + 1);
          }
          await saveCandles(connection, candles, table);
          start = moment.utc(candles[candles.length - 1].timestamp);
        } else {
          start.add(interval, 'milliseconds');
        }
        await wait(params.waitRequest);
      }
    },
    candlesCron: (params) => {
      const table = params.table;
      const interval = params.interval;
      new CronJob('00 * * * * *', async () => {
        const timestamp = moment.utc().startOf('second').subtract(interval, 'milliseconds');
        if ((timestamp.valueOf() % interval) !== 0) { return };
        let candle = null;
        for (let i = 0; i < 15 && (!candle || !candle.volume); i += 1) {
          const start = timestamp.clone().subtract(interval * 5, 'milliseconds').format('YYYY-MM-DD HH:mm:ss');
          candle = (await params.rest.getCandles({
            symbol: params.symbol,
            start: start,
            interval: interval,
          })).data.find(v => v.timestamp === timestamp.format('YYYY-MM-DD HH:mm:ss'));
          if (candle) {
            console.log(candle.timestamp);
            await saveCandles(connection, [candle], table);
          }
          await wait(500);
        }
      }, () => { }, true);
    },
  };
  return populator;
};
module.exports = Populator;
