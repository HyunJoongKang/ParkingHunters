#import "NaviBridge.h"
#import "KNNaviViewController.h"

// 실제 우산 헤더 이름은 `pod install` 이후 Pods/Headers/Public/KNSDK-UI/ 안에서
// 확인해서 다르면 이 import 한 줄만 고치면 된다 (팟 이름 KNSDK-UI -> 모듈명 KNSDK_UI 관례를 따름).
#import <KNSDK_UI/KNSDK_UI.h>

// 안드로이드 MainActivity.kt의 KNSDK_APP_KEY와 동일한, 카카오 개발자 콘솔에서 발급받은
// 실제 네이티브 앱 키. Android는 패키지명+키 해시를 등록하지만 iOS는 콘솔의 플랫폼
// 설정(iOS)에 Bundle ID를 별도로 등록해야 한다 — Android 쪽만 등록했다면 iOS에서는
// 여전히 초기화가 실패("C103 SDK Certification Failed" 등)할 수 있다.
static NSString *const kKNSDKAppKey = @"820ee81b7911aae2b04c5ab9ec63736c";

static BOOL sKNSDKInitialized = NO;
static NSString *sKNSDKInitError = nil;

@implementation NaviBridge

+ (BOOL)isInitialized {
    return sKNSDKInitialized;
}

+ (NSString *)initializationErrorMessage {
    return sKNSDKInitError;
}

+ (void)initializeKNSDK {
    @try {
        NSString *deviceId = [[[UIDevice currentDevice] identifierForVendor] UUIDString] ?: @"unknown-device";
        NSString *clientVersion = [[[NSBundle mainBundle] infoDictionary] objectForKey:@"CFBundleShortVersionString"] ?: @"1.0";
        NSLog(@"[KNSDK] 초기화 시작 (deviceId=%@)", deviceId);

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
                sKNSDKInitError = [NSString stringWithFormat:@"%@ %@", @(error.code), error.msg];
                NSLog(@"[KNSDK] 초기화 실패: %@", sKNSDKInitError);
            } else {
                sKNSDKInitialized = YES;
                NSLog(@"[KNSDK] 초기화 완료");
            }
        }];
    } @catch (NSException *exception) {
        sKNSDKInitError = exception.reason;
        NSLog(@"[KNSDK] 초기화 중 예외 발생: %@", exception);
    }
}

+ (void)startNaviFromViewController:(UIViewController *)presenter
                                name:(NSString *)name
                                 lat:(double)lat
                                 lng:(double)lng {
    @try {
        KNNaviViewController *naviVC = [[KNNaviViewController alloc] initWithDestinationName:name lat:lat lng:lng];
        naviVC.modalPresentationStyle = UIModalPresentationFullScreen;
        [presenter presentViewController:naviVC animated:YES completion:nil];
    } @catch (NSException *exception) {
        NSLog(@"[KNSDK] 내비게이션 화면 표시 중 예외 발생: %@", exception);
    }
}

@end
