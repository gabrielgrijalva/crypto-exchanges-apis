const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const wait = require('../_utils/wait');
const round = require('../_utils/round');
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
  populatorSettings.TIMEZONE = populatorSettings.TIMEZONE || 'Z';
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
        const response = await params.rest.getCandles({
          symbol: params.symbol,
          start: start.format('YYYY-MM-DD HH:mm:ss'),
          interval: interval,
        });
        if (response.data) {
          const candles = response.data.filter(v => v.open && v.high && v.low && v.close);
          if (candles.length) {
            console.log(candles[0].timestamp);
            const finishIndex = candles.findIndex(v => v.timestamp === finish.format('YYYY-MM-DD HH:mm:ss'));
            if (finishIndex !== -1) {
              candles.splice(finishIndex + 1);
            }
            await saveCandles(connection, candles, table);
            start = moment.utc(candles[candles.length - 1].timestamp);
          } else {
            start.add(interval, 'milliseconds');
          }
          await wait(params.waitRequest);
        } else {
          console.log(response.error);
        }
      }
    },
    candlesCron: (params) => {
      const table = params.table;
      const interval = params.interval;
      new CronJob('00/30 * * * * *', async () => {
        const timestamp = moment(round.down(moment.utc().valueOf() / interval, 0)
          * params.interval).utc().subtract(params.interval, 'milliseconds');
        let candle = null;
        for (let i = 0; i < 5; i += 1) {
          const start = timestamp.clone().subtract(interval * 5, 'milliseconds').format('YYYY-MM-DD HH:mm:ss');
          const response = await params.rest.getCandles({
            symbol: params.symbol,
            start: start,
            interval: interval,
          });
          if (response.data) {
            candle = response.data.find(v => v.timestamp === timestamp.format('YYYY-MM-DD HH:mm:ss'));
            if (candle && candle.open && candle.high && candle.low && candle.close) {
              console.log(candle.timestamp);
              await saveCandles(connection, [candle], table);
            }
          } else {
            console.log(response.error);
          }
          await wait(1000);
        }
      }, () => { }, true, null, null, true);
    },
  };
  return populator;
};
module.exports = Populator;
