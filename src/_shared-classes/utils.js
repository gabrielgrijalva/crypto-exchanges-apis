const round = require('../_utils/round');
/**
 * 
 * 
 * 
 * =================================
 * UTILS DEFINITION
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../typings/_utils').utilsSettings} utilsSettings
 */
function Utils(utilsSettings) {
  const INSTRUMENT_TYPE = utilsSettings.TYPE;
  const BALANCE_TYPE = utilsSettings.BALANCE_TYPE;
  const QUANTITY_TYPE = utilsSettings.QUANTITY_TYPE;
  const PRICE_STEP = utilsSettings.PRICE_STEP;
  const QUANTITY_VALUE = utilsSettings.QUANTITY_VALUE;
  const BASE_PRECISION = utilsSettings.BASE_PRECISION;
  const QUOTE_PRECISION = utilsSettings.QUOTE_PRECISION;
  const PRICE_PRECISION = utilsSettings.PRICE_PRECISION;
  const QUANTITY_PRECISION = utilsSettings.QUANTITY_PRECISION;
  /**
   * 
   * 
   * 
   * @type {import('../../typings/_utils').Utils}
   * 
   * 
   * 
   */
  const utils = {
    /**
     * 
     * 
     * GET ORDER ID
     * 
     * 
     */
    getOrderId: (symbol) => '',
    /**
     * 
     * 
     * GET OPEN ORDER QUANTITY FROM BALANCE
     * 
     * 
     */
    getOpenOrderQtyFromBalance: (() => {
      if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
        return (px, qty, rnd) => round[rnd](qty / QUANTITY_VALUE, QUANTITY_PRECISION);
      }
      if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'quote') {
        return (px, qty, rnd) => round[rnd](qty / (QUANTITY_VALUE / px), QUANTITY_PRECISION);
      }
      if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
        return (px, qty, rnd) => round[rnd]((qty / px) / QUANTITY_VALUE, QUANTITY_PRECISION);
      }
      throw new Error('Could not find function of getOpenOrderQtyFromBalance');
    })(),
    /**
     * 
     * 
     * GET CLOSE ORDER QUANTITY FROM OPEN POSITION
     * 
     * 
     */
    getCloseOrderQtyFromOpenPosition: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (px, qty, rnd) => round[rnd]((qty / px) / QUANTITY_VALUE, QUANTITY_PRECISION);
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (px, qty, rnd) => round[rnd](qty, QUANTITY_PRECISION);
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        return (px, qty, rnd) => round[rnd](qty, QUANTITY_PRECISION);
      }
      throw new Error('Could not find function of getCloseOrderQtyFromOpenPosition');
    })(),
    /**
     * 
     * 
     * GET OPEN POSITION QTY FROM OPEN EXECUTION
     * 
     * 
     */
    getOpenPositionQtyFromOpenExecution: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (px, qty, rnd) => round[rnd]((qty * QUANTITY_VALUE) * px, QUOTE_PRECISION);
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (px, qty, rnd) => round[rnd](qty, QUANTITY_PRECISION);
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        return (px, qty, rnd) => round[rnd](qty, QUANTITY_PRECISION);
      }
      throw new Error('Could not find function of getOpenPositionQtyFromOpenExecution');
    })(),
    /**
     * 
     * 
     * GET PNL
     * 
     * 
     */
    getPnl: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            if (!qty) { return 0 };
            const entFeeBal = (qty / entPx) * entFee;
            const extFeeBal = (qty / extPx) * extFee;
            const pnl = qty / extPx - qty / entPx;
            return round.normal(pnl - entFeeBal - extFeeBal, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            if (!qty) { return 0 };
            const entFeeBal = ((qty * QUANTITY_VALUE) * entPx) * entFee;
            const extFeeBal = ((qty * QUANTITY_VALUE) * extPx) * extFee;
            const pnl = (extPx - entPx) * (qty * QUANTITY_VALUE);
            return round.normal(pnl - entFeeBal - extFeeBal, QUOTE_PRECISION);
          }
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            if (!qty) { return 0 };
            const entFeeBal = (qty * QUANTITY_VALUE) * entFee;
            const extFeeBal = (qty * QUANTITY_VALUE) * extFee;
            const pxDiff = side === 'sell' ? (entPx - extPx) : (extPx - entPx);
            const pnl = (pxDiff * (qty * QUANTITY_VALUE)) / extPx;
            return round.normal(pnl - entFeeBal - extFeeBal, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'quote') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            if (!qty) { return 0 };
            const entFeeBal = ((qty * QUANTITY_VALUE) / entPx) * entFee;
            const extFeeBal = ((qty * QUANTITY_VALUE) / extPx) * extFee;
            const pxDiff = side === 'sell'
              ? (QUANTITY_VALUE / extPx - QUANTITY_VALUE / entPx)
              : (QUANTITY_VALUE / entPx - QUANTITY_VALUE / extPx);
            const pnl = pxDiff * qty;
            return round.normal(pnl - entFeeBal - extFeeBal, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            if (!qty) { return 0 };
            const entFeeBal = ((qty * QUANTITY_VALUE) * entPx) * entFee;
            const extFeeBal = ((qty * QUANTITY_VALUE) * extPx) * extFee;
            const pxDiff = side === 'sell' ? (entPx - extPx) : (extPx - entPx);
            const pnl = pxDiff * (qty * QUANTITY_VALUE);
            return round.normal(pnl - entFeeBal - extFeeBal, QUOTE_PRECISION);
          }
        }
      }
      throw new Error('Could not find function of getPnl');
    })(),
    /**
     * 
     * 
     * GET OB EXECUTION PRICE
     * 
     * 
     */
    getOBExecutionPrice: (() => {
      if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price >= skipPrice) : (v.price <= skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          if (skipPriceIndex === -1) return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNB = order.quantity * QUANTITY_VALUE;
            if (skipVol > orderNB) {
              skipVol = skipVol - orderNB; orderNB = 0;
            } else {
              orderNB = orderNB - skipVol; skipVol = 0;
            }
            const execNB = orderNB < bal ? orderNB : bal;
            const execNQ = execNB * order.price;
            qtyNB = qtyNB + execNB;
            qtyNQ = qtyNQ + execNQ;
            bal = bal > execNB ? bal - execNB : 0;
          }
          return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
        };
      }
      if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'quote') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price >= skipPrice) : (v.price <= skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          if (skipPriceIndex === -1) return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNB = (QUANTITY_VALUE / order.price) * order.quantity;
            if (skipVol > orderNB) {
              skipVol = skipVol - orderNB; orderNB = 0;
            } else {
              orderNB = orderNB - skipVol; skipVol = 0;
            }
            const execNB = orderNB < bal ? orderNB : bal;
            const execNQ = execNB * order.price;
            qtyNB = qtyNB + execNB;
            qtyNQ = qtyNQ + execNQ;
            bal = bal > execNB ? bal - execNB : 0;
          }
          return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
        };
      }
      if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price >= skipPrice) : (v.price <= skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          if (skipPriceIndex === -1) return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNQ = (order.quantity * QUANTITY_VALUE) * order.price;
            if (skipVol > orderNQ) {
              skipVol = skipVol - orderNQ; orderNQ = 0;
            } else {
              orderNQ = orderNQ - skipVol; skipVol = 0;
            }
            const execNQ = orderNQ < bal ? orderNQ : bal;
            const execNB = execNQ / order.price;
            qtyNQ = qtyNQ + execNQ;
            qtyNB = qtyNB + execNB;
            bal = bal > orderNQ ? bal - orderNQ : 0;
          }
          return round.normal(qtyNQ / qtyNB, PRICE_PRECISION);
        };
      }
      throw new Error('Could not find function of getOBExecutionPrice');
    })(),
    /**
     * 
     * 
     * GET BAL INV FROM POSITION
     * 
     * 
     */
    getBalInvFromPosition: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty / px, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal((qty * QUANTITY_VALUE) * px, QUOTE_PRECISION);
          }
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty * QUANTITY_VALUE, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'base' && QUANTITY_TYPE === 'quote') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal((QUANTITY_VALUE / px) * qty, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote' && QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(((qty * QUANTITY_VALUE) * px), QUOTE_PRECISION);
          }
        }
      }
      throw new Error('Could not find function of getBalInvFromPosition');
    })(),
    /**
     * 
     * 
     * GET VALUE NB FROM POSITION
     * 
     * 
     */
    getNBValueFromPosition: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty / px, BASE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty * QUANTITY_VALUE, BASE_PRECISION);
          }
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        if (QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty * QUANTITY_VALUE, BASE_PRECISION);
          }
        }
        if (QUANTITY_TYPE === 'quote') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal((qty * QUANTITY_VALUE) / px, BASE_PRECISION);
          }
        }
      }
      throw new Error('Could not find function of getNBValueFromPosition');
    })(),
    /**
     * 
     * 
     * GET VALUE NQ FROM POSITION
     * 
     * 
     */
    getNQValueFromPosition: (() => {
      if (INSTRUMENT_TYPE === 'spot') {
        if (BALANCE_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty, QUOTE_PRECISION);
          }
        }
        if (BALANCE_TYPE === 'quote') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal((qty * QUANTITY_VALUE) * px, QUOTE_PRECISION);
          }
        }
      }
      if (INSTRUMENT_TYPE === 'future' || INSTRUMENT_TYPE === 'option') {
        if (QUANTITY_TYPE === 'base') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal((qty * QUANTITY_VALUE) * px, QUOTE_PRECISION);
          }
        }
        if (QUANTITY_TYPE === 'quote') {
          return (px, qty) => {
            if (!qty) { return 0 };
            return round.normal(qty * QUANTITY_VALUE, QUOTE_PRECISION);
          }
        }
      }
      throw new Error('Could not find function of getNQValueFromPosition');
    })(),
    /**
     * 
     * 
     * GET CHANGE PX BY PERCENTAGE
     * 
     * 
     */
    getChangePxByPercentage: (() => {
      // Lineal Calculation
      if (BALANCE_TYPE === 'quote') {
        return (px, per) => round.normal(round.normal((px * (1 + per))
          / PRICE_STEP, 0) * PRICE_STEP, PRICE_PRECISION);
      }
      // Inverse Calculation
      if (BALANCE_TYPE === 'base') {
        return (px, per) => round.normal(round.normal((px / (1 + -1 * per))
          / PRICE_STEP, 0) * PRICE_STEP, PRICE_PRECISION);
      }
      throw new Error('Could not find function of getChangePxByPercentage');
    })(),
  };
  return utils;
}
module.exports = Utils;
