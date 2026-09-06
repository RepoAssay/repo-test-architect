import 'package:test/test.dart';
import 'package:checkout_rules/price.dart';

void main() {
  test('members receive a discount', () {
    expect(discountedPrice(100, true), 90);
  });
}
