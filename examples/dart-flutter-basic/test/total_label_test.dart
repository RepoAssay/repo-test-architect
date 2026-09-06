import 'package:flutter_test/flutter_test.dart';
import '../lib/total_label.dart';

void main() {
  testWidgets('shows the total', (tester) async {
    await tester.pumpWidget(const TotalLabel(total: 100));
    expect(find.text('Total: 100'), findsOneWidget);
  });
}
