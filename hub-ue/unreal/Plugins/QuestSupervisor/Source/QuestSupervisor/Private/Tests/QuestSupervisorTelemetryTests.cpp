#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"

#include "Dom/JsonObject.h"
#include "QuestSupervisorTelemetryState.h"
#include "QuestSupervisorTypes.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorFrameRateWindowTest,
    "QuestSupervisor.Telemetry.FrameRateWindow",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorFrameRateWindowTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorFrameRateWindow Window;
    Window.Reset();

    for (int32 FrameIndex = 0; FrameIndex < 15; ++FrameIndex)
    {
        Window.AddFrame(1.0 / 30.0);
    }
    Window.AddFrame(-1.0);
    TestFalse(TEXT("Invalid deltas reset a partial window"), Window.HasSample());

    for (int32 FrameIndex = 0; FrameIndex < 60; ++FrameIndex)
    {
        Window.AddFrame(1.0 / 60.0);
    }

    TestTrue(TEXT("A complete 60 FPS window produces a sample"), Window.HasSample());
    TestTrue(
        TEXT("The one-second window reports 60 FPS"),
        FMath::IsNearlyEqual(Window.GetFramesPerSecond(), 60.0f, 0.01f));

    Window.AddFrame(1.25);
    TestFalse(TEXT("A pause longer than one second resets the sample"), Window.HasSample());

    for (int32 FrameIndex = 0; FrameIndex < 30; ++FrameIndex)
    {
        Window.AddFrame(1.0 / 30.0);
    }

    TestTrue(TEXT("Sampling recovers after a long pause"), Window.HasSample());
    TestTrue(
        TEXT("The recovered one-second window reports 30 FPS"),
        FMath::IsNearlyEqual(Window.GetFramesPerSecond(), 30.0f, 0.01f));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorProbeWindowTest,
    "QuestSupervisor.Telemetry.ProbeWindow",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorProbeWindowTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorProbeWindow Window;
    Window.Reset();

    for (int32 ProbeIndex = 0; ProbeIndex < FQuestSupervisorProbeWindow::MinimumSamples; ++ProbeIndex)
    {
        const FString MessageId = FString::Printf(TEXT("probe-%d"), ProbeIndex);
        const int64 Sequence = Window.NextSequence();
        const double SentAtSeconds = 10.0 * static_cast<double>(ProbeIndex);
        Window.AddPending(MessageId, Sequence, SentAtSeconds);
        TestTrue(
            TEXT("A matching pong resolves its pending probe"),
            Window.ResolvePong(
                MessageId,
                TOptional<int64>(Sequence),
                SentAtSeconds + (0.01 * static_cast<double>(ProbeIndex + 1))));
    }

    TestTrue(TEXT("Five completed probes satisfy discovery warm-up"), Window.HasMinimumSamples());
    TestTrue(TEXT("Successful pongs discover probe support"), Window.HasSuccessfulSample());
    TestTrue(
        TEXT("Latest RTT uses the monotonic send/receive delta"),
        FMath::IsNearlyEqual(Window.GetLatestRttMs(), 50.0f, 0.01f));
    TestTrue(
        TEXT("A fully successful window reports zero application loss"),
        FMath::IsNearlyZero(Window.GetPacketLossPct()));

    const int64 TimeoutSequence = Window.NextSequence();
    Window.AddPending(TEXT("probe-timeout"), TimeoutSequence, 100.0);
    Window.ExpireTimedOut(104.99);
    TestEqual(TEXT("Probe remains pending before five seconds"), Window.GetPendingProbeCount(), 1);
    Window.ExpireTimedOut(105.0);
    TestEqual(TEXT("Probe expires at five seconds"), Window.GetPendingProbeCount(), 0);
    TestTrue(
        TEXT("Timeout contributes to rolling application loss"),
        FMath::IsNearlyEqual(Window.GetPacketLossPct(), 100.0f / 6.0f, 0.01f));

    Window.Reset();
    TestEqual(TEXT("Reconnect reset clears completed samples"), Window.GetCompletedSampleCount(), 0);
    TestEqual(TEXT("Reconnect reset clears pending probes"), Window.GetPendingProbeCount(), 0);
    TestEqual(TEXT("Reconnect reset restarts probe sequence"), Window.NextSequence(), int64{1});

    for (int32 ProbeIndex = 0; ProbeIndex < FQuestSupervisorProbeWindow::MinimumSamples; ++ProbeIndex)
    {
        const double SentAtSeconds = static_cast<double>(ProbeIndex) * 10.0;
        Window.AddPending(
            FString::Printf(TEXT("lost-%d"), ProbeIndex),
            Window.NextSequence(),
            SentAtSeconds);
        Window.ExpireTimedOut(SentAtSeconds + FQuestSupervisorProbeWindow::TimeoutSeconds);
    }
    TestTrue(TEXT("Five timeouts satisfy the loss warm-up"), Window.HasMinimumSamples());
    TestFalse(TEXT("An all-timeout window has no RTT sample"), Window.HasSuccessfulSample());
    TestTrue(
        TEXT("An all-timeout window reports one hundred percent probe loss"),
        FMath::IsNearlyEqual(Window.GetPacketLossPct(), 100.0f, 0.01f));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorConnectionGenerationTest,
    "QuestSupervisor.Telemetry.ConnectionGeneration",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorConnectionGenerationTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorConnectionGeneration Generation;
    const uint64 First = Generation.BeginConnection();
    TestTrue(TEXT("The first connection generation is current"), Generation.IsCurrent(First));

    const uint64 Second = Generation.BeginConnection();
    TestFalse(TEXT("A replaced connection generation becomes stale"), Generation.IsCurrent(First));
    TestTrue(TEXT("The replacement generation is current"), Generation.IsCurrent(Second));

    Generation.Invalidate();
    TestFalse(TEXT("Disconnect invalidates the current generation"), Generation.IsCurrent(Second));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorProbeRollingLimitTest,
    "QuestSupervisor.Telemetry.ProbeRollingLimit",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorProbeRollingLimitTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorProbeWindow Window;
    for (int32 ProbeIndex = 0; ProbeIndex < FQuestSupervisorProbeWindow::MaximumSamples + 5; ++ProbeIndex)
    {
        const FString MessageId = FString::Printf(TEXT("rolling-%d"), ProbeIndex);
        const int64 Sequence = Window.NextSequence();
        const double SentAtSeconds = static_cast<double>(ProbeIndex) * 10.0;
        Window.AddPending(MessageId, Sequence, SentAtSeconds);
        Window.ResolvePong(MessageId, TOptional<int64>(Sequence), SentAtSeconds + 0.01);
    }

    TestEqual(
        TEXT("Probe history is capped at thirty completed samples"),
        Window.GetCompletedSampleCount(),
        FQuestSupervisorProbeWindow::MaximumSamples);
    TestTrue(
        TEXT("Latest RTT remains available after rolling eviction"),
        FMath::IsNearlyEqual(Window.GetLatestRttMs(), 10.0f, 0.01f));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorExperienceClockTest,
    "QuestSupervisor.Telemetry.ExperienceClock",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorExperienceClockTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorExperienceClock Clock;
    TestTrue(TEXT("Started echo activates experience time"), Clock.ObserveLifecycle(TEXT("started"), TEXT("run-1"), 10.0));
    TestTrue(TEXT("Experience is active after started echo"), Clock.IsActive());
    TestTrue(TEXT("Elapsed time follows the monotonic clock"), FMath::IsNearlyEqual(Clock.GetElapsedSeconds(15.0), 5.0f));

    Clock.ObserveLifecycle(TEXT("started"), TEXT("run-1"), 12.0);
    TestTrue(
        TEXT("Idempotent started echo does not restart the clock"),
        FMath::IsNearlyEqual(Clock.GetElapsedSeconds(15.0), 5.0f));

    Clock.ObserveLifecycle(TEXT("ended"), TEXT("another-run"), 16.0);
    TestTrue(TEXT("An unrelated ended echo does not stop the active run"), Clock.IsActive());
    Clock.ObserveLifecycle(TEXT("ended"), TEXT("run-1"), 17.0);
    TestFalse(TEXT("Matching ended echo clears the active run"), Clock.IsActive());
    TestTrue(TEXT("No active experience reports zero elapsed time"), FMath::IsNearlyZero(Clock.GetElapsedSeconds(20.0)));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FQuestSupervisorTelemetryJsonTest,
    "QuestSupervisor.Telemetry.SchemaV2Json",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FQuestSupervisorTelemetryJsonTest::RunTest(const FString& Parameters)
{
    FQuestSupervisorTelemetrySnapshot Telemetry;
    Telemetry.SchemaVersion = 2;
    Telemetry.Context.Source = TEXT("quest-supervisor-plugin");
    Telemetry.Context.Origin = TEXT("automatic");
    Telemetry.Context.Platform = TEXT("android");
    Telemetry.Context.ExecutionMode = TEXT("packaged");
    Telemetry.BatteryTemperatureC = 37.5f;
    Telemetry.TemperatureC = 37.5f;
    Telemetry.SupervisorUptimeSec = 20.0f;
    Telemetry.SessionElapsedSec = 20.0f;
    Telemetry.ExperienceElapsedSec = 8.0f;

    FQuestSupervisorTelemetryMetricAvailability CpuAvailability;
    CpuAvailability.Status = TEXT("unavailable");
    CpuAvailability.Reason = TEXT("not-implemented");
    Telemetry.Availability.Add(TEXT("cpuPct"), CpuAvailability);

    const TSharedPtr<FJsonObject> Json = QuestSupervisorTelemetryJson::BuildTelemetryObject(Telemetry);
    TestEqual(TEXT("Telemetry schema is version two"), Json->GetIntegerField(TEXT("schemaVersion")), 2);
    TestEqual(
        TEXT("Canonical battery temperature is serialized"),
        static_cast<float>(Json->GetNumberField(TEXT("batteryTemperatureC"))),
        37.5f);
    TestEqual(
        TEXT("Legacy temperature alias remains serialized"),
        static_cast<float>(Json->GetNumberField(TEXT("temperatureC"))),
        37.5f);
    TestEqual(
        TEXT("Legacy session elapsed field keeps supervisor uptime semantics"),
        static_cast<float>(Json->GetNumberField(TEXT("sessionElapsedSec"))),
        20.0f);

    const TSharedPtr<FJsonObject> Context = Json->GetObjectField(TEXT("context"));
    TestEqual(TEXT("Telemetry origin is automatic"), Context->GetStringField(TEXT("origin")), FString(TEXT("automatic")));
    const TSharedPtr<FJsonObject> Availability = Json->GetObjectField(TEXT("availability"));
    const TSharedPtr<FJsonObject> Cpu = Availability->GetObjectField(TEXT("cpuPct"));
    TestEqual(TEXT("CPU is explicitly unavailable"), Cpu->GetStringField(TEXT("status")), FString(TEXT("unavailable")));
    TestEqual(TEXT("CPU unavailability has a reason"), Cpu->GetStringField(TEXT("reason")), FString(TEXT("not-implemented")));
    return true;
}

#endif
