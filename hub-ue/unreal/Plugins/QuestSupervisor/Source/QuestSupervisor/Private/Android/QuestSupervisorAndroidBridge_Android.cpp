#include "QuestSupervisorAndroidBridge.h"

#if PLATFORM_ANDROID
#include "Android/AndroidApplication.h"
#include <jni.h>

bool FQuestSupervisorAndroidBridge::Initialize()
{
    bInitialized = true;
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor Android bridge initialized."));
    return true;
}

void FQuestSupervisorAndroidBridge::Shutdown()
{
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor Android bridge shutdown."));
    bStreaming = false;
    bInitialized = false;
}

bool FQuestSupervisorAndroidBridge::RequestMediaProjectionPermission()
{
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor MediaProjection permission request reserved for Phase 2."));
    return true;
}

bool FQuestSupervisorAndroidBridge::StartScreenCapture()
{
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor screen capture reserved for Phase 2."));
    return true;
}

void FQuestSupervisorAndroidBridge::StopScreenCapture()
{
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor screen capture stopped."));
}

bool FQuestSupervisorAndroidBridge::ConfigureVideoEncoder(const FQuestSupervisorStreamingConfig& Config)
{
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor encoder setup reserved: %s @ %d kbps"), *Config.Resolution, Config.BitrateKbps);
    return true;
}

bool FQuestSupervisorAndroidBridge::StartWebRtcStream(const FString& PeerId)
{
    bStreaming = !PeerId.IsEmpty();
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor WebRTC stream reserved for peer %s"), *PeerId);
    return bStreaming;
}

void FQuestSupervisorAndroidBridge::StopWebRtcStream()
{
    bStreaming = false;
    UE_LOG(LogTemp, Log, TEXT("QuestSupervisor WebRTC stream stopped."));
}

bool FQuestSupervisorAndroidBridge::IsAvailable() const
{
    return true;
}

bool FQuestSupervisorAndroidBridge::ReadBatteryTelemetry(FQuestSupervisorBatteryTelemetry& OutTelemetry) const
{
    OutTelemetry = FQuestSupervisorBatteryTelemetry{};

    if (!bInitialized)
    {
        return false;
    }

    JNIEnv* Env = FAndroidApplication::GetJavaEnv();
    jobject Activity = FAndroidApplication::GetGameActivityThis();
    if (!Env || !Activity)
    {
        return false;
    }

    jclass ActivityClass = Env->GetObjectClass(Activity);
    jclass IntentFilterClass = Env->FindClass("android/content/IntentFilter");
    jclass IntentClass = Env->FindClass("android/content/Intent");
    if (!ActivityClass || !IntentFilterClass || !IntentClass)
    {
        if (ActivityClass) { Env->DeleteLocalRef(ActivityClass); }
        if (IntentFilterClass) { Env->DeleteLocalRef(IntentFilterClass); }
        if (IntentClass) { Env->DeleteLocalRef(IntentClass); }
        return false;
    }

    jmethodID IntentFilterCtor = Env->GetMethodID(IntentFilterClass, "<init>", "(Ljava/lang/String;)V");
    jmethodID RegisterReceiverMethod = Env->GetMethodID(
        ActivityClass,
        "registerReceiver",
        "(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;)Landroid/content/Intent;");
    jmethodID GetIntExtraMethod = Env->GetMethodID(IntentClass, "getIntExtra", "(Ljava/lang/String;I)I");

    if (!IntentFilterCtor || !RegisterReceiverMethod || !GetIntExtraMethod)
    {
        Env->DeleteLocalRef(ActivityClass);
        Env->DeleteLocalRef(IntentFilterClass);
        Env->DeleteLocalRef(IntentClass);
        return false;
    }

    jstring BatteryChangedAction = Env->NewStringUTF("android.intent.action.BATTERY_CHANGED");
    jobject IntentFilter = Env->NewObject(IntentFilterClass, IntentFilterCtor, BatteryChangedAction);
    jobject BatteryIntent = IntentFilter
        ? Env->CallObjectMethod(Activity, RegisterReceiverMethod, nullptr, IntentFilter)
        : nullptr;

    bool bSuccess = false;

    if (BatteryIntent)
    {
        jstring LevelKey = Env->NewStringUTF("level");
        jstring ScaleKey = Env->NewStringUTF("scale");
        jstring TemperatureKey = Env->NewStringUTF("temperature");

        const jint Level = Env->CallIntMethod(BatteryIntent, GetIntExtraMethod, LevelKey, -1);
        const jint Scale = Env->CallIntMethod(BatteryIntent, GetIntExtraMethod, ScaleKey, -1);
        const jint Temperature = Env->CallIntMethod(BatteryIntent, GetIntExtraMethod, TemperatureKey, -1);

        if (Scale > 0 && Level >= 0)
        {
            OutTelemetry.BatteryPct = static_cast<float>(Level) * 100.0f / static_cast<float>(Scale);
            OutTelemetry.bHasBatteryPct = true;
            bSuccess = true;
        }

        if (Temperature >= 0)
        {
            // ACTION_BATTERY_CHANGED reports temperature in tenths of a degree Celsius.
            OutTelemetry.TemperatureC = static_cast<float>(Temperature) / 10.0f;
            OutTelemetry.bHasTemperatureC = true;
            bSuccess = true;
        }

        Env->DeleteLocalRef(LevelKey);
        Env->DeleteLocalRef(ScaleKey);
        Env->DeleteLocalRef(TemperatureKey);
        Env->DeleteLocalRef(BatteryIntent);
    }

    if (IntentFilter)
    {
        Env->DeleteLocalRef(IntentFilter);
    }

    Env->DeleteLocalRef(BatteryChangedAction);
    Env->DeleteLocalRef(ActivityClass);
    Env->DeleteLocalRef(IntentFilterClass);
    Env->DeleteLocalRef(IntentClass);

    return bSuccess;
}
#endif
