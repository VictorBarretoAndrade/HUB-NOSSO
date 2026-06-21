#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorSettings.generated.h"

UCLASS(config = Game, defaultconfig, meta = (DisplayName = "Quest Supervisor"))
class QUESTSUPERVISOR_API UQuestSupervisorSettings : public UDeveloperSettings
{
    GENERATED_BODY()

public:
    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Connection")
    bool bSupervisorEnabled = true;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Connection")
    bool bAutoConnectOnStartup = false;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Connection")
    FString SupervisorEndpoint = TEXT("127.0.0.1:8787");

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Connection")
    FString AuthToken;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Commands")
    bool bAutoAckCommands = true;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Heartbeat", meta = (ClampMin = "0.25"))
    float HeartbeatIntervalSeconds = 2.0f;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Reconnect", meta = (ClampMin = "0.25"))
    float InitialReconnectDelaySeconds = 1.0f;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Reconnect", meta = (ClampMin = "0.25"))
    float MaxReconnectDelaySeconds = 30.0f;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Identity")
    FString DeviceId;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Identity")
    FString DeviceLabel;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Identity")
    FString AppId;

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Identity")
    FString AppVersion = TEXT("0.1.0");

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Identity")
    FString HeadsetModel = TEXT("Meta Quest 3");

    UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Capabilities")
    FQuestSupervisorDeviceCapabilities Capabilities;

    virtual FName GetCategoryName() const override;
};
