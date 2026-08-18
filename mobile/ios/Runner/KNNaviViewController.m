#import "KNNaviViewController.h"
#import <CoreLocation/CoreLocation.h>
#import <KNSDK_UI/KNSDK_UI.h>

// ============================================================================
// 확인 필요(이 파일 전체): 이 프로젝트에는 Xcode/Swift 컴파일러가 없어 안드로이드 쪽처럼
// 실제 컴파일 에러로 시그니처를 검증하지 못했다. KNSDK/KNPOI/KNGuidance/KNNaviView의
// 핵심 메서드(초기화, makeTripWithStart:goal:vias:completion:, convertWGS84ToKATEC...,
// initWithGuidance:trip:routeOption:avoidOption:)는 공식 Objective-C 클래스 레퍼런스
// 페이지에서 직접 확인했다. 그러나 아래 KNGuidance_*Delegate 6개 프로토콜의 "필수
// 메서드 전체 목록과 정확한 셀렉터 철자"는 일부만 확인되었고 나머지는 안드로이드 Kotlin
// 버전과의 대칭으로 추정한 것이다(주석 표시). Xcode에서 이 클래스가 프로토콜을 완전히
// 구현하지 않는다는 경고가 뜨면, Xcode의 Fix-it으로 정확한 시그니처를 채워 넣을 것.
// ============================================================================

@interface KNNaviViewController () <CLLocationManagerDelegate,
    KNGuidance_GuideStateDelegate,
    KNGuidance_LocationGuideDelegate,
    KNGuidance_RouteGuideDelegate,
    KNGuidance_SafetyGuideDelegate,
    KNGuidance_VoiceGuideDelegate,
    KNGuidance_CitsGuideDelegate>

@property (nonatomic, copy) NSString *destName;
@property (nonatomic, assign) double destLat;
@property (nonatomic, assign) double destLng;
@property (nonatomic, strong) CLLocationManager *locationManager;
@property (nonatomic, strong, nullable) KNNaviView *naviView;
@property (nonatomic, assign) BOOL tripStarted;

@end

@implementation KNNaviViewController

- (instancetype)initWithDestinationName:(NSString *)name lat:(double)lat lng:(double)lng {
    self = [super init];
    if (self) {
        _destName = name;
        _destLat = lat;
        _destLng = lng;
        _tripStarted = NO;
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor blackColor];

    if (!isfinite(self.destLat) || !isfinite(self.destLng) || (self.destLat == 0 && self.destLng == 0)) {
        [self failWithMessage:[NSString stringWithFormat:@"목적지 좌표가 올바르지 않습니다: %f, %f", self.destLat, self.destLng]];
        return;
    }

    self.locationManager = [[CLLocationManager alloc] init];
    self.locationManager.delegate = self;
    self.locationManager.desiredAccuracy = kCLLocationAccuracyBest;

    CLAuthorizationStatus status = [CLLocationManager authorizationStatus];
    if (status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways) {
        [self.locationManager requestLocation];
    } else if (status == kCLAuthorizationStatusNotDetermined) {
        [self.locationManager requestWhenInUseAuthorization];
    } else {
        [self failWithMessage:@"위치 권한이 필요합니다."];
    }
}

#pragma mark - CLLocationManagerDelegate

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
    CLAuthorizationStatus status = manager.authorizationStatus;
    if (status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways) {
        [manager requestLocation];
    } else if (status == kCLAuthorizationStatusDenied || status == kCLAuthorizationStatusRestricted) {
        [self failWithMessage:@"위치 권한이 필요합니다."];
    }
}

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
    if (self.tripStarted) {
        return;
    }
    CLLocation *current = locations.lastObject;
    if (current == nil) {
        [self failWithMessage:@"현재 위치를 확인할 수 없습니다."];
        return;
    }
    self.tripStarted = YES;
    [self startTripFromLatitude:current.coordinate.latitude longitude:current.coordinate.longitude];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    [self failWithMessage:@"현재 위치를 가져오지 못했습니다."];
}

#pragma mark - Trip / Guidance

// KATEC 좌표계 변환 — KNPOI는 WGS84(위경도)가 아니라 KATEC x/y(SInt32)를 받는다.
// 초기화가 끝나지 않았거나 좌표가 변환 불가능한 값이면 KNSDK 내부에서 예외를 던질 수
// 있어(디컴파일로 시그니처만 확인했을 뿐 내부 구현은 보장 못 함) @try/@catch로 감싸
// 실패 시 nil을 돌려주고 호출부가 안전하게 종료하게 한다.
- (nullable KNPOI *)poiWithName:(NSString *)name latitude:(double)lat longitude:(double)lng {
    @try {
        CGPoint katec = [[KNSDK sharedInstance] convertWGS84ToKATECWithLongitude:lng latitude:lat];
        return [[KNPOI alloc] initWithName:name
                                          x:(SInt32)katec.x
                                          y:(SInt32)katec.y
                                    address:name];
    } @catch (NSException *exception) {
        NSLog(@"[KNNaviViewController] 좌표 변환 실패 (name=%@, lat=%f, lng=%f): %@", name, lat, lng, exception);
        return nil;
    }
}

- (void)startTripFromLatitude:(double)lat longitude:(double)lng {
    KNPOI *start = [self poiWithName:@"현재 위치" latitude:lat longitude:lng];
    KNPOI *goal = [self poiWithName:self.destName latitude:self.destLat longitude:self.destLng];
    if (start == nil || goal == nil) {
        [self failWithMessage:@"좌표 변환에 실패했습니다."];
        return;
    }

    __weak typeof(self) weakSelf = self;
    @try {
        [[KNSDK sharedInstance] makeTripWithStart:start
                                              goal:goal
                                              vias:nil
                                        completion:^(KNError * _Nullable error, KNTrip * _Nullable trip) {
            dispatch_async(dispatch_get_main_queue(), ^{
                __strong typeof(weakSelf) strongSelf = weakSelf;
                if (strongSelf == nil) {
                    return;
                }
                if (error != nil || trip == nil) {
                    NSLog(@"[KNNaviViewController] 경로 탐색 실패: %@ %@", @(error.code), error.msg);
                    [strongSelf failWithMessage:[NSString stringWithFormat:@"경로 탐색에 실패했습니다: %@", error.msg]];
                    return;
                }
                [strongSelf beginGuidanceWithTrip:trip];
            });
        }];
    } @catch (NSException *exception) {
        NSLog(@"[KNNaviViewController] 경로 탐색 요청 중 예외 발생: %@", exception);
        [self failWithMessage:@"내비게이션 시작 중 오류가 발생했습니다."];
    }
}

- (void)beginGuidanceWithTrip:(KNTrip *)trip {
    @try {
        KNGuidance *guidance = [[KNSDK sharedInstance] sharedGuidance];
        if (guidance == nil) {
            NSLog(@"[KNNaviViewController] sharedGuidance가 nil — 초기화가 완료되지 않았을 수 있음");
            [self failWithMessage:@"내비게이션을 시작할 수 없습니다."];
            return;
        }
        guidance.guideStateDelegate = self;
        guidance.locationGuideDelegate = self;
        guidance.routeGuideDelegate = self;
        guidance.safetyGuideDelegate = self;
        guidance.voiceGuideDelegate = self;
        guidance.citsGuideDelegate = self;

        self.naviView = [[KNNaviView alloc] initWithGuidance:guidance
                                                         trip:trip
                                                  routeOption:KNRoutePriorityRecommand
                                                  avoidOption:KNRouteAvoidOptionNone];
        self.naviView.frame = self.view.bounds;
        self.naviView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        [self.view addSubview:self.naviView];
    } @catch (NSException *exception) {
        NSLog(@"[KNNaviViewController] 내비게이션 화면 초기화 중 예외 발생: %@", exception);
        [self failWithMessage:@"내비게이션 화면을 표시할 수 없습니다."];
    }
}

- (void)failWithMessage:(NSString *)message {
    NSLog(@"[KNNaviViewController] %@", message);
    [self dismissViewControllerAnimated:YES completion:nil];
}

- (void)dealloc {
    [[[KNSDK sharedInstance] sharedGuidance] stop];
}

#pragma mark - KNGuidance_GuideStateDelegate
// guidanceGuideEnded:isShowDriveResultDialog: 는 공식 KNNaviView 레퍼런스 페이지에서
// 실제 셀렉터로 확인됨. 나머지는 안드로이드 버전과의 대칭 추정(확인 필요).

- (void)guidanceGuideStarted:(KNGuidance *)aGuidance {}
- (void)guidanceCheckingRouteChange:(KNGuidance *)aGuidance {}
- (void)guidanceOutOfRoute:(KNGuidance *)aGuidance {}
- (void)guidanceRouteUnchanged:(KNGuidance *)aGuidance {}
- (void)guidanceRouteChanged:(KNGuidance *)aGuidance {}

- (void)guidanceGuideEnded:(KNGuidance *)aGuidance isShowDriveResultDialog:(BOOL)aIsShowDriveResultDialog {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self dismissViewControllerAnimated:YES completion:nil];
    });
}

#pragma mark - KNGuidance_LocationGuideDelegate

- (void)guidance:(KNGuidance *)aGuidance didUpdateLocation:(id)aLocationGuide {}

#pragma mark - KNGuidance_RouteGuideDelegate
// didUpdateRoutes:multiRouteInfo: 는 공식 KNNaviView 레퍼런스 페이지에서 실제
// 셀렉터(guidance:didUpdateRoutes:multiRouteInfo:)로 확인됨.

- (void)guidance:(KNGuidance *)aGuidance didUpdateRoutes:(NSArray *)aRoutes multiRouteInfo:(nullable id)aMultiRouteInfo {}
- (void)guidance:(KNGuidance *)aGuidance didUpdateRouteGuide:(id)aRouteGuide {}

#pragma mark - KNGuidance_SafetyGuideDelegate

- (void)guidance:(KNGuidance *)aGuidance didUpdateSafetyGuide:(nullable id)aSafetyGuide {}
- (void)guidance:(KNGuidance *)aGuidance didUpdateAroundSafeties:(nullable NSArray *)aSafeties {}

#pragma mark - KNGuidance_VoiceGuideDelegate
// shouldPlayVoiceGuide:replaceSndData: 는 공식 KNNaviView 레퍼런스 페이지에서 실제
// 셀렉터로 확인됨.

- (BOOL)guidance:(KNGuidance *)aGuidance shouldPlayVoiceGuide:(id)aVoiceGuide replaceSndData:(NSArray<NSData *> *)aData {
    return YES;
}
- (void)guidance:(KNGuidance *)aGuidance willPlayVoiceGuide:(id)aVoiceGuide {}
- (void)guidance:(KNGuidance *)aGuidance didFinishPlayVoiceGuide:(id)aVoiceGuide {}

#pragma mark - KNGuidance_CitsGuideDelegate

- (void)guidance:(KNGuidance *)aGuidance didUpdateCitsGuide:(id)aCitsGuide {}

@end
