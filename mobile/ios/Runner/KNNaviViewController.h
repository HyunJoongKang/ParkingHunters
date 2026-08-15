#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// 안드로이드 NaviActivity.kt를 그대로 옮긴 화면 — 현재 위치를 얻어 KNSDK로 경로를
// 탐색하고, KNNaviView를 붙여 안내를 시작한다.
@interface KNNaviViewController : UIViewController

- (instancetype)initWithDestinationName:(NSString *)name lat:(double)lat lng:(double)lng;

@end

NS_ASSUME_NONNULL_END
