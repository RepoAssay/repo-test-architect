import 'package:flutter/widgets.dart';

class TotalLabel extends StatelessWidget {
  const TotalLabel({super.key, required this.total});
  final int total;

  @override
  Widget build(BuildContext context) {
    return Text('Total: $total', textDirection: TextDirection.ltr);
  }
}
