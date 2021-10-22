module.exports = {
  up: (number, precision) => {
    const multiplicator = 10 ** precision;
    return Math.ceil(number * multiplicator) / multiplicator;
  },
  down: (number, precision) => {
    const multiplicator = 10 ** precision;
    return Math.floor(number * multiplicator) / multiplicator;
  },
  normal: (number, precision) => {
    const multiplicator = 10 ** precision;
    return Math.round(number * multiplicator) / multiplicator;
  },
};
