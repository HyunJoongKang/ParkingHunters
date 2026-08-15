#import "NaviBridge.h"
#import "KNNaviViewController.h"

// 실제 우산 헤더 이름은 `pod install` 이후 Pods/Headers/Public/KNSDK-UI/ 안에서
// 확인해서 다르면 이 import 한 줄만 고치면 된다 (팟 이름 KNSDK-UI -> 모듈명 KNSDK_UI 관례를 따름).
#import <KNSDK_UI/KNSDK_UI.h>

// 안드로이드 MainActivity.kt의 KNSDK_APP_KEY와 동일한 값.
static NSString *const kKNSDKAppKey = @"820ee81b7911aae2b04c5ab9ec63736c";

@implementation NaviBridge

+ (void)initializeKNSDK {
    NSString *deviceId = [[[UIDevice currentDevice] identifierForVendor] UUIDString] ?: @"unknown-device";
    NSString *clientVersion = [[[NSBundle mainBundle] infoDictionary] objectForKey:@"CFBundleShortVersionString"] ?: @"1.0";

    // TODO(확인 필요): iOS의 initializeWithAppKey:는 안드로이드(5개 인자)와 달리
    // langType 뒤에 mapType: 인자가 하나 더 있는 6인자 시그니처로 공식 문서에서 확인됨.
    // KNMapType의 실제 enum 값 이름은 이 자리에서 다시 한 번 헤더(KNSDK.h)를 열어
    // 정확한 대소문자를 맞춰야 한다 — 아래 KNMapTypeMap은 최선 추정치.
    [[KNSDK sharedInstance] initializeWithAppKey:kKNSDKAppKey
                                    clientVersion:clientVersion
                                          userKey:deviceId
                                         langType:KNLanguageTypeKorean
                                          mapType:KNMapTypeMap
                                       completion:^(KNError * _Nullable error) {
        if (error != nil) {
            NSLog(@"[KNSDK] 초기화 실패: %@ %@", @(error.code), error.msg);
        }
    }];
}

+ (void)startNaviFromViewController:(UIViewController *)presenter
                                name:(NSString *)name
                                 lat:(double)lat
                                 lng:(double)lng {
    KNNaviViewController *naviVC = [[KNNaviViewController alloc] initWithDestinationName:name lat:lat lng:lng];
    naviVC.modalPresentationStyle = UIModalPresentationFullScreen;
    [presenter presentViewController:naviVC animated:YES completion:nil];
}

@end
