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
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestCreateOrder(rest, params, errors = 0) {
  const response = await rest.createOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'post-only-reject'
      || response.error.type === 'insufficient-funds'
      || response.error.type === 'request-not-accepted') {
      return sendRestCreateOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestUpdateOrder(rest, params, errors = 0) {
  const response = await rest.updateOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'post-only-reject'
      || response.error.type === 'insufficient-funds'
      || response.error.type === 'request-not-accepted') {
      return sendRestUpdateOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestCancelOrder(rest, params, errors = 0) {
  const response = await rest.cancelOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestCancelOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {number} fixQtyS 
 * @param {number} fixQtyB
 * @param {'limit' | 'market'} fixType 
 * @param {import('../../typings/_ws').Ws} ws 
 * @param {import('../../typings/_utils').Utils} utils 
 * @param {import('../../typings/_rest').getPositionResponseData} position 
 * @param {import('../../typings/settings')} settings 
 * @returns {import('../../typings/_rest').createOrderParams}
 */
function getFixOrder(fixQtyS, fixQtyB, fixType, ws, utils, position, settings) {
  /** @type {'sell' | 'buy'} */
  let side = 'sell';
  /** @type {number} */
  let quantity = 0;
  /** @type {'open' | 'close'} */
  let direction = 'open';
  // SELL
  if (position.qtyS) {
    // OPEN SELL
    if (fixQtyS > position.qtyS) {
      side = 'sell';
      quantity = round.normal(fixQtyS - position.qtyS, settings.INSTRUMENT.QUANTITY_PRECISION);
      direction = 'open';
    }
    // CLOSE SELL
    if (fixQtyS < position.qtyS) {
      side = 'buy';
      quantity = round.normal(position.qtyS - fixQtyS, settings.INSTRUMENT.QUANTITY_PRECISION);
      direction = 'close';
    }
  }
  // BUY
  if (position.qtyB) {
    // OPEN BUY
    if (fixQtyB > position.qtyB) {
      side = 'buy';
      quantity = round.normal(fixQtyB - position.qtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
      direction = 'open';
    }
    // CLOSE BUY
    if (fixQtyB < position.qtyB) {
      side = 'sell';
      quantity = round.normal(position.qtyB - fixQtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
      direction = 'close';
    }
  }
  if (!quantity) { return };
  // HANDLE MIN QUANTITY
  if (quantity < settings.INSTRUMENT.QUANTITY_MIN) {
    side = direction === 'open' ? side : (side === 'sell' ? 'buy' : 'sell');
    quantity = round.normal(quantity + settings.INSTRUMENT.QUANTITY_MIN, settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = direction === 'open' ? direction : 'close'
  };
  const orderParams = {};
  orderParams.id = utils.getOrderId();
  orderParams.side = side;
  orderParams.type = fixType;
  if (orderParams.type === 'limit') {
    orderParams.price = orderParams.side === 'sell' ? ws.orderBook.info.asks[0].price : ws.orderBook.info.bids[0].price;
  }
  orderParams.quantity = quantity;
  orderParams.direction = direction;
  return orderParams;
};
/**
 * 
 * @param {import('../../typings/_ws').Ws} ws 
 * @param {import('../../typings/_ws').dataCreationsUpdates} order 
 * @returns {import('../../typings/_rest').updateOrderParams}
 */
function getFixOrderUpdate(ws, order) {
  const price = order.side === 'sell' ? ws.orderBook.info.asks[0].price : ws.orderBook.info.bids[0].price;
  return { id: order.id, price: price };
};
/**
 * 
 * @param {import('../../typings/_ws').dataCreationsUpdates} order 
 * @returns {import('../../typings/_rest').cancelOrderParams}
 */
function getFixOrderCancel(order) {
  return { id: order.id };
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
 * @param {import('../../typings/settings')} settings
 */
function Fixer(settings) {
  /**
   * 
   * 
   * @type {import('../../typings/_fixer').Fixer}
   * 
   * 
   */
  const fixer = {
    /**
     * 
     * 
     * 
     * FIXER EXECUTE
     * 
     * 
     * 
     */
    execute: (params) => {
      const ws = params.ws;
      const rest = params.rest;
      const utils = params.utils;
      const qtyS = params.qtyS;
      const qtyB = params.qtyB;
      const type = params.type;
      return new Promise(async resolve => {
        /** @type {import('../../typings/_ws').dataCreationsUpdates} */
        let order = null;
        let orderQtyF = 0;
        let creating = false;
        let updating = false;
        let canceling = false;
        let creatingTimeout = null;
        let updatingTimeout = null;
        let cancelingTimeout = null;
        const creationsUpdatesFunc = (messages) => {
          console.log('creations-updates'); console.log(messages);
          if (creating) {
            creating = false;
            clearTimeout(creatingTimeout);
          };
          if (updating) {
            updating = false;
            clearTimeout(updatingTimeout);
          }
          messages.forEach(v => order = v);
        };
        ws.orders.events.on('creations-updates', creationsUpdatesFunc);
        const executionsFunc = (messages) => {
          console.log('executions'); console.log(messages);
          for (let i = 0; messages[i]; i += 1) {
            const message = messages[i];
            if (message.id === order.id) {
              orderQtyF = round.normal(orderQtyF + message.quantity, settings.INSTRUMENT.QUANTITY_PRECISION);
            }
            if (orderQtyF >= order.quantity) {
              order = null;
              orderQtyF = 0;
              creating = false;
              updating = false;
              canceling = false;
              clearTimeout(creatingTimeout);
              clearTimeout(updatingTimeout);
              clearTimeout(cancelingTimeout);
            }
          }
        };
        ws.orders.events.on('executions', executionsFunc);
        const cancelationsFunc = (messages) => {
          console.log('cancelations'); console.log(messages);
          order = null;
          orderQtyF = 0;
          creating = false;
          updating = false;
          canceling = false;
          clearTimeout(creatingTimeout);
          clearTimeout(updatingTimeout);
          clearTimeout(cancelingTimeout);
        };
        ws.orders.events.on('cancelations', cancelationsFunc);
        (async function main() {
          if (!order && !creating && !updating && !canceling) {
            await wait(1000);
            const position = ws.position.info;
            if (qtyS !== position.qtyS || qtyB !== position.qtyB) {
              creating = true;
              creatingTimeout = setTimeout(() => { throw new Error('creatingTimeout') }, 10000);
              sendRestCreateOrder(rest, getFixOrder(qtyS, qtyB, type, ws, utils, position, settings));
            }
          } else if (order && !creating && !updating && !canceling && type === 'limit'
            && ((order.side === 'sell' && order.price > ws.orderBook.info.asks[0].price)
              || (order.side === 'buy' && order.price < ws.orderBook.info.bids[0].price))) {
            if (rest.updateOrder) {
              updating = true;
              updatingTimeout = setTimeout(() => { throw new Error('updatingTimeout') }, 10000);
              sendRestUpdateOrder(rest, getFixOrderUpdate(ws, order));
            } else {
              canceling = true;
              cancelingTimeout = setTimeout(() => { throw new Error('cancelingTimeout') }, 10000);
              sendRestCancelOrder(rest, getFixOrderCancel(order));
            }
          }
          const position = ws.position.info;
          if (qtyS === position.qtyS && qtyB === position.qtyB) {
            resolve();
            ws.orders.events.removeListener('creations-updates', creationsUpdatesFunc);
            ws.orders.events.removeListener('executions', executionsFunc);
            ws.orders.events.removeListener('cancelations', cancelationsFunc);
          } else {
            await wait(100); main();
          }
        })();
      });
    },
  };
  return fixer;
};
module.exports = Fixer;
