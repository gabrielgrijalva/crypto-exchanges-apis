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
 * @param {RestN.getCandlesResponseData} candles 
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
 * @param {RestN.Rest} rest 
 */
function Populator(rest) {
  /**
   * @param {PopulatorN.populatorOptions} populatorOptions 
   */
  function PopulatorFunc(populatorOptions) {
    // Default populatorOptions values
    populatorOptions = populatorOptions || {};
    populatorOptions.port = populatorOptions.port || 3306;
    populatorOptions.host = populatorOptions.host || 'localhost';
    populatorOptions.user = populatorOptions.user || 'root';
    populatorOptions.database = populatorOptions.database || '';
    populatorOptions.password = populatorOptions.password || '';
    populatorOptions.timezone = populatorOptions.timezone || 'Z';
    // Create database connection
    const connection = mysql.createConnection(populatorOptions);
    /**
     * 
     * 
     * @type {PopulatorN.Populator}
     * 
     * 
     */
    const populator = {
      candles: async (params) => {
        const table = params.table;
        const symbol = params.symbol;
        const interval = params.interval;
        let start = moment.utc(params.start);
        const finish = moment.utc(params.finish);
        while (start.unix() < finish.unix()) {
          const candles = (await rest.getCandles({
            start: start.format('YYYY-MM-DD HH:mm:ss'),
            symbol: symbol,
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
        const symbol = params.symbol;
        const interval = params.interval;
        new CronJob('00 * * * * *', async () => {
          const timestamp = moment.utc().startOf('second').subtract(interval, 'milliseconds');
          if ((timestamp.valueOf() % interval) !== 0) { return };
          let candle = null
          for (let i = 0; i < 15 && !candle; i += 1) {
            const start = timestamp.clone().subtract(interval * 5, 'milliseconds').format('YYYY-MM-DD HH:mm:ss');
            candle = (await rest.getCandles({
              start: start,
              symbol: symbol,
              interval: interval,
            })).data.find(v => v.timestamp === timestamp.format('YYYY-MM-DD HH:mm:ss'));
            if (candle) {
              console.log(candle.timestamp);
              await saveCandles(connection, [candle], table);
            }
          }
        }, () => { }, true);
      },
    };
    return populator;
  }
  return PopulatorFunc;
};
module.exports = Populator;
