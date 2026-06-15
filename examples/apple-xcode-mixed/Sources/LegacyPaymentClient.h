#import <Foundation/Foundation.h>

@interface LegacyPaymentClient : NSObject
- (BOOL)canChargeCents:(NSInteger)cents;
@end
