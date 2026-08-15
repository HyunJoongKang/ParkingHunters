#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// Flutter(Swift) 쪽에서 부르는 진입점 2개.
// 안드로이드의 MainActivity.kt(initKNSDK) + NaviActivity.kt(startTrip/beginGuidance)를
// 그대로 옮긴 것 — Objective-C 전용 KNSDK-UI 팟을 감싸는 얇은 브릿지 역할만 한다.
@interface NaviBridge : NSObject

+ (void)initializeKNSDK;

+ (void)startNaviFromViewController:(UIViewController *)presenter
                                name:(NSString *)name
                                 lat:(double)lat
                                 lng:(double)lng NS_SWIFT_NAME(startNavi(from:name:lat:lng:));

@end

NS_ASSUME_NONNULL_END
