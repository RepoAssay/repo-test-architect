module.exports = function parsePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new TypeError("Price must be a non-negative number");
  }

  return price;
};
