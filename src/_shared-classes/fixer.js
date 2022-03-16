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
async function sendRestGetPosition(rest, errors = 0) {
  const response = await rest.getPosition();
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestGetPosition(rest, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestCreateOrder(rest, params, errors = 0) {
  const response = await rest.createOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
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
 * @param {number} positionQtyS 
 * @param {number} positionQtyB 
 * @param {import('../../typings/_ws').Ws} ws 
 * @param {import('../../typings/_utils').Utils} utils 
 * @param {import('../../typings/settings')} settings 
 * @returns {import('../../typings/_rest').createOrderParams}
 */
function getFixOrderCreate(fixQtyS, fixQtyB, fixType, positionQtyS, positionQtyB, ws, utils, settings) {
  /** @type {'sell' | 'buy'} */
  let side = 'sell';
  /** @type {number} */
  let quantity = 0;
  /** @type {'open' | 'close'} */
  let direction = 'open';
  const type = settings.INSTRUMENT.TYPE;
  const bestAsk = ws.orderBook.info.asks[0].price;
  const bestBid = ws.orderBook.info.bids[0].price;
  // OPEN SELL
  if (fixQtyS > positionQtyS) {
    side = 'sell';
    quantity = round.normal((fixQtyS - positionQtyS) / (type === 'spot' ? bestAsk : 1), settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE SELL
  if (fixQtyS < positionQtyS) {
    side = 'buy';
    quantity = round.normal((positionQtyS - fixQtyS) / (type === 'spot' ? bestBid : 1), settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'close';
  }
  // OPEN BUY
  if (fixQtyB > positionQtyB) {
    side = 'buy';
    quantity = round.normal(fixQtyB - positionQtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE BUY
  if (fixQtyB < positionQtyB) {
    side = 'sell';
    quantity = round.normal(positionQtyB - fixQtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'close';
  }
  if (!quantity) { return };
  // HANDLE MIN QUANTITY
  if (quantity < settings.INSTRUMENT.QUANTITY_MIN) {
    side = direction === 'open' ? side : (side === 'sell' ? 'buy' : 'sell');
    quantity = round.normal(quantity + settings.INSTRUMENT.QUANTITY_MIN, settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'open';
  };
  const orderParams = {};
  orderParams.id = utils.getOrderId();
  orderParams.side = side;
  orderParams.type = fixType;
  if (orderParams.type === 'limit') {
    orderParams.price = orderParams.side === 'sell' ? bestAsk : bestBid;
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
 * @param {number} fixQtyS 
 * @param {number} fixQtyB
 * @param {number} positionQtyS 
 * @param {number} positionQtyB 
 * @param {import('../../typings/settings')} settings 
 * @returns {boolean}
 */
function shouldCreateFixOrder(fixQtyS, fixQtyB, positionQtyS, positionQtyB, settings) {
  const instruType = settings.INSTRUMENT.TYPE;
  const qtyPrecision = instruType === 'future' ? settings.INSTRUMENT.QUANTITY_PRECISION : settings.INSTRUMENT.BALANCE_PRECISION;
  const fixQtyAbs = round.normal(fixQtyB - fixQtyS, qtyPrecision);
  const positionQtyAbs = round.normal(positionQtyB - positionQtyS, qtyPrecision);
  if (fixQtyAbs === positionQtyAbs) {
    return false;
  }
  const fixQtyDiffS = Math.abs(fixQtyS - positionQtyS);
  const fixQtyDiffB = Math.abs(fixQtyB - positionQtyB);
  const quantityMinDiff = settings.INSTRUMENT.QUANTITY_MIN * 0.50;
  if (instruType === 'spot' && (fixQtyDiffS <= quantityMinDiff || fixQtyDiffB <= quantityMinDiff)) {
    return false;
  }
  return true;
}
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
        const initialPosition = await sendRestGetPosition(rest);
        /** @type {import('../../typings/_ws').dataCreationsUpdates} */
        let order = null;
        let orderQtyF = 0;
        let creating = false;
        let updating = false;
        let canceling = false;
        let creatingTimeout = null;
        let updatingTimeout = null;
        let cancelingTimeout = null;
        let positionQtyS = initialPosition.qtyS;
        let positionQtyB = initialPosition.qtyB;
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
              positionQtyS = round.normal(positionQtyS + (message.side === 'sell' ? message.quantity : 0), settings.INSTRUMENT.QUANTITY_PRECISION);
              positionQtyB = round.normal(positionQtyB + (message.side === 'buy' ? message.quantity : 0), settings.INSTRUMENT.QUANTITY_PRECISION);
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
            if (shouldCreateFixOrder(qtyS, qtyB, positionQtyS, positionQtyB, settings)) {
              creating = true;
              creatingTimeout = setTimeout(() => { throw new Error('creatingTimeout') }, 10000);
              try {
                await sendRestCreateOrder(rest, getFixOrderCreate(qtyS, qtyB, type, positionQtyS, positionQtyB, ws, utils, settings));
              } catch (error) {
                if (error.type === 'post-only-reject') { creating = false }
                else throw error;
              }
            }
          } else if (order && !creating && !updating && !canceling && type === 'limit'
            && ((order.side === 'sell' && order.price > ws.orderBook.info.asks[0].price)
              || (order.side === 'buy' && order.price < ws.orderBook.info.bids[0].price))) {
            if (rest.updateOrder) {
              updating = true;
              updatingTimeout = setTimeout(() => { throw new Error('updatingTimeout') }, 10000);
              try {
                await sendRestUpdateOrder(rest, getFixOrderUpdate(ws, order));
              } catch (error) {
                if (error.type === 'post-only-reject' || error.type === 'order-not-found') { updating = false }
                else throw error;
              }
            } else {
              canceling = true;
              cancelingTimeout = setTimeout(() => { throw new Error('cancelingTimeout') }, 10000);
              try {
                await sendRestCancelOrder(rest, getFixOrderCancel(order));
              } catch (error) {
                if (error.type === 'order-not-found') { canceling = false }
                else throw error;
              }
            }
          }
          if (!shouldCreateFixOrder(qtyS, qtyB, positionQtyS, positionQtyB, settings)) {
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
