#pragma once

#include "CoreMinimal.h"

class FJsonObject;
struct FQuestSupervisorTelemetrySnapshot;

struct FQuestSupervisorPendingProbe
{
    int64 Sequence = 0;
    double SentAtSeconds = 0.0;
};

struct FQuestSupervisorProbeSample
{
    bool bSucceeded = false;
    double RttMs = 0.0;
};

class FQuestSupervisorConnectionGeneration
{
public:
    uint64 BeginConnection();
    void Invalidate();
    bool IsCurrent(uint64 Generation) const;

private:
    uint64 CurrentGeneration = 0;
};

class FQuestSupervisorFrameRateWindow
{
public:
    static constexpr double WindowSeconds = 1.0;

    void Reset();
    void AddFrame(double DeltaSeconds);

    bool HasSample() const;
    float GetFramesPerSecond() const;

private:
    double AccumulatedSeconds = 0.0;
    int32 AccumulatedFrames = 0;
    float FramesPerSecond = 0.0f;
    bool bHasSample = false;
};

class FQuestSupervisorProbeWindow
{
public:
    static constexpr double SendIntervalSeconds = 2.0;
    static constexpr double TimeoutSeconds = 5.0;
    static constexpr int32 MaximumSamples = 30;
    static constexpr int32 MinimumSamples = 5;

    void Reset();
    int64 NextSequence();
    void AddPending(const FString& MessageId, int64 Sequence, double SentAtSeconds);
    void RemovePending(const FString& MessageId);
    bool ResolvePong(const FString& CorrelationId, const TOptional<int64>& Sequence, double ReceivedAtSeconds);
    void ExpireTimedOut(double NowSeconds);

    bool HasMinimumSamples() const;
    bool HasSuccessfulSample() const;
    float GetLatestRttMs() const;
    float GetPacketLossPct() const;
    int32 GetCompletedSampleCount() const;
    int32 GetPendingProbeCount() const;

private:
    void AddCompletedSample(bool bSucceeded, double RttMs);

    TMap<FString, FQuestSupervisorPendingProbe> PendingProbes;
    TArray<FQuestSupervisorProbeSample> CompletedSamples;
    int64 SequenceCounter = 0;
};

class FQuestSupervisorExperienceClock
{
public:
    void Reset();
    bool ObserveLifecycle(const FString& Event, const FString& RunId, double ObservedAtSeconds);

    bool IsActive() const;
    const FString& GetRunId() const;
    float GetElapsedSeconds(double NowSeconds) const;

private:
    FString ActiveRunId;
    double StartedAtSeconds = 0.0;
    bool bActive = false;
};

class FQuestSupervisorTelemetryState
{
public:
    void Reset();

    FQuestSupervisorFrameRateWindow FrameRate;
    FQuestSupervisorProbeWindow Probes;
    FQuestSupervisorExperienceClock Experience;
    FQuestSupervisorConnectionGeneration Connection;
};

namespace QuestSupervisorTelemetryJson
{
    TSharedPtr<FJsonObject> BuildTelemetryObject(const FQuestSupervisorTelemetrySnapshot& Telemetry);
}
