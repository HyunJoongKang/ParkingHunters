allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://devrepo.kakaomobility.com/repository/kakao-mobility-android-knsdk-public/") }
        maven { url = uri("https://devrepo.kakaomobility.com/repository/kakao-mobility-android-knsdk-release/") }
        maven { url = uri("https://devrepo.kakaomobility.com/repository/kakao-mobility-android-locationsdk-release/") }
        maven { url = uri("https://www.jitpack.io") }
    }
}

// 프로젝트가 OneDrive 동기화 폴더 안에 있으면 OneDrive가 build 산출물에
// 삭제 거부(DENY) ACL을 상속시켜 Gradle이 mergeDebugNativeLibs 등에서
// AccessDeniedException으로 실패한다. build 출력만 OneDrive 밖(LOCALAPPDATA)으로 옮긴다.
val newBuildDir = File(System.getenv("LOCALAPPDATA"), "GradleBuilds/daegu_parking_app")
rootProject.layout.buildDirectory.set(newBuildDir)

subprojects {
    val newSubprojectBuildDir = File(newBuildDir, project.name)
    project.layout.buildDirectory.set(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
