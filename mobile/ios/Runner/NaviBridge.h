#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// Flutter(Swift) 쪽에서 부르는 진입점 2개.
// 안드로이드의 MainActivity.kt(initKNSDK) + NaviActivity.kt(startTrip/beginGuidance)를
// 그대로 옮긴 것 — Objective-C 전용 KNSDK-UI 팟을 감싸는 얇은 브릿지 역할만 한다.
@interface NaviBridge : NSObject

+ (void)initializeKNSDK;

// initializeWithAppKey:는 비동기 완료 콜백이라, 완료 전에 KNNaviViewController가
// KNSDK를 호출하면(설치 직후 사용자가 바로 길찾기를 누르는 경우 등) 네이티브 예외로
// 앱 전체가 죽는다. AppDelegate가 startNavi 전에 이 값을 확인해 막는다.
+ (BOOL)isInitialized;

+ (nullable NSString *)initializationErrorMessage;

+ (void)startNaviFromViewController:(UIViewController *)presenter
                                name:(NSString *)name
                                 lat:(double)lat
                                 lng:(double)lng NS_SWIFT_NAME(startNavi(from:name:lat:lng:));

@end

NS_ASSUME_NONNULL_END
