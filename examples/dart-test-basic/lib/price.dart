int discountedPrice(int price, bool member) {
  if (price < 0) throw ArgumentError.value(price, 'price');
  return member ? price * 9 ~/ 10 : price;
}
