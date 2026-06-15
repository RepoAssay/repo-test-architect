#import "LegacyPaymentClient.h"

@implementation LegacyPaymentClient
- (BOOL)canChargeCents:(NSInteger)cents {
    return cents > 0;
}
@end
