
type Exchange = {
  ws: WsN.Ws;
  rest: RestN.Rest;
  utils: UtilsN.Utils;
  populator: PopulatorN.Populator;
}
export const BinanceCoin: Exchange;
export const Bitmex: Exchange;
export const Bybit: Exchange;
export const BybitFutures: Exchange;
export const Deribit: Exchange;
export const KrakenFutures: Exchange;
export const Okex: Exchange;
