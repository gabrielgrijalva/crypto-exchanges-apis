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
 * @param {number} fixPositionQtyS 
 * @param {number} fixPositionQtyB
 * @param {'limit' | 'market'} fixPositionType 
 * @param {number} currentPositionQtyS 
 * @param {number} currentPositionQtyB 
 * @param {import('../../typings/_ws').Ws} ws 
 * @param {import('../../typings/_utils').Utils} utils 
 * @param {import('../../typings/settings')} settings 
 * @returns {import('../../typings/_rest').createOrderParams}
 */
function getFixOrderCreate(fixPositionQtyS, fixPositionQtyB, fixPositionType, currentPositionQtyS, currentPositionQtyB, ws, utils, settings) {
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
  if (fixPositionQtyS > currentPositionQtyS) {
    side = 'sell';
    quantity = round.normal((fixPositionQtyS - currentPositionQtyS) / (type === 'spot' ? bestAsk : 1), settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE SELL
  if (fixPositionQtyS < currentPositionQtyS) {
    side = 'buy';
    quantity = round.normal((currentPositionQtyS - fixPositionQtyS) / (type === 'spot' ? bestBid : 1), settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'close';
  }
  // OPEN BUY
  if (fixPositionQtyB > currentPositionQtyB) {
    side = 'buy';
    quantity = round.normal(fixPositionQtyB - currentPositionQtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE BUY
  if (fixPositionQtyB < currentPositionQtyB) {
    side = 'sell';
    quantity = round.normal(currentPositionQtyB - fixPositionQtyB, settings.INSTRUMENT.QUANTITY_PRECISION);
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
  orderParams.type = fixPositionType;
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
 * @param {number} fixPositionQtyS 
 * @param {number} fixPositionQtyB
 * @param {number} currentPositionQtyS 
 * @param {number} currentPositionQtyB 
 * @param {import('../../typings/settings')} settings 
 * @returns {boolean}
 */
function shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, settings) {
  const instruType = settings.INSTRUMENT.TYPE;
  const qtyPrecision = instruType === 'future' ? settings.INSTRUMENT.QUANTITY_PRECISION : settings.INSTRUMENT.BALANCE_PRECISION;
  const fixQtyAbs = round.normal(fixPositionQtyB - fixPositionQtyS, qtyPrecision);
  const positionQtyAbs = round.normal(currentPositionQtyB - currentPositionQtyS, qtyPrecision);
  if (fixQtyAbs === positionQtyAbs) {
    return false;
  }
  const fixQtyDiffS = Math.abs(fixPositionQtyS - currentPositionQtyS);
  const fixQtyDiffB = Math.abs(fixPositionQtyB - currentPositionQtyB);
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
      const fixPositionType = params.fixPositionType;
      const fixPositionQtyS = params.fixPositionQtyS;
      const fixPositionQtyB = params.fixPositionQtyB;
      return new Promise(async resolve => {
        const currentPosition = await sendRestGetPosition(rest);
        /** @type {import('../../typings/_ws').dataCreationsUpdates} */
        let order = null;
        let orderQtyF = 0;
        let creating = false;
        let updating = false;
        let canceling = false;
        let creatingTimeout = null;
        let updatingTimeout = null;
        let cancelingTimeout = null;
        let currentPositionQtyS = currentPosition.qtyS;
        let currentPositionQtyB = currentPosition.qtyB;
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
              currentPositionQtyS = round.normal(currentPositionQtyS + (message.side === 'sell' ? message.quantity : 0), settings.INSTRUMENT.QUANTITY_PRECISION);
              currentPositionQtyB = round.normal(currentPositionQtyB + (message.side === 'buy' ? message.quantity : 0), settings.INSTRUMENT.QUANTITY_PRECISION);
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
            if (shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, settings)) {
              creating = true;
              creatingTimeout = setTimeout(() => { throw new Error('creatingTimeout') }, 10000);
              try {
                await sendRestCreateOrder(rest, getFixOrderCreate(fixPositionQtyS, fixPositionQtyB, fixPositionType, currentPositionQtyS, currentPositionQtyB, ws, utils, settings));
              } catch (error) {
                if (error.type === 'post-only-reject') { creating = false }
                else throw error;
              }
            }
          } else if (order && !creating && !updating && !canceling && fixPositionType === 'limit'
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
          if (!shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, settings)) {
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
