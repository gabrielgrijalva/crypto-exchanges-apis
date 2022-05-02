const ws = require('ws');
const moment = require('moment');

function OrderBookServer() {
  /** @type {import('../../typings/_ws').orderBooksServerWsObject} */
  const orderBookServer = {
    create: (params) => {
      const wss = new ws.Server({
        port: params.port,
        host: params.host,
        clientTracking: true,
      });
      wss.on('listening', function listening() {
        console.log(`wss listening on ${params.port}: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);
      });
      wss.on('connection', function connection(ws) {
        console.log(`wss connection: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);
      });
      wss.on('error', function error() {
        console.log(`wss error: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);
        throw new Error('Websocket server connection error...');
      });
      wss.on('close', function close() {
        console.log(`wss close: ${moment.utc().format('YYYY-MM-DD HH:mm:ss')}`);
        throw new Error('Websocket server connection closed...');
      });
      setInterval(() => {
        wss.clients.forEach((client) => {
          client.send(JSON.stringify(params.orderBookWs.data.reduce((a, v) => {
            a.push({
              symbol: v.symbol,
              asks: v.asks.slice(0, 100),
              bids: v.bids.slice(0, 100),
            });
            return a;
          }, [])));
        });
      }, params.broadcast);
    }
  };
  return orderBookServer;
};
module.exports = OrderBookServer;
