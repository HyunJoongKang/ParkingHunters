plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.daeguparking.daegu_parking_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        // MainActivity.kt에서 BuildConfig.VERSION_NAME을 KNSDK 초기화에 사용하기 위함.
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.daeguparking.daegu_parking_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // KNSDK(카카오내비 SDK)가 minSdk 26(Android 8.0)을 요구해 Flutter 기본값 대신 명시한다.
        minSdk = maxOf(flutter.minSdkVersion, 26)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // 카카오모빌리티 내비게이션 SDK(KNSDK) UI — 인앱 내비 화면(KNNaviView) 포함.
    // https://developers.kakaomobility.com/guide/android-ui/start.html
    implementation("com.kakaomobility.knsdk:knsdk_ui:1.12.7")
    // KNSDK 내부 레이아웃(dialog_base_error.xml 등)이 ConstraintLayout 속성을 쓰는데
    // 이 프로젝트엔 없어서 리소스 링크가 실패한다 — KNSDK가 직접 선언하지 않은
    // 전이 의존성이라 명시적으로 추가해야 한다.
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    // 출발지(현재 위치) POI를 만들 때 실제 GPS 좌표를 얻는 데 사용(NaviActivity.kt).
    // knsdk_ui가 전이 의존성으로 이미 21.0.1을 받아오지만, 코드에서 직접 import하므로
    // 명시적으로도 선언해 둔다.
    implementation("com.google.android.gms:play-services-location:21.0.1")
}
