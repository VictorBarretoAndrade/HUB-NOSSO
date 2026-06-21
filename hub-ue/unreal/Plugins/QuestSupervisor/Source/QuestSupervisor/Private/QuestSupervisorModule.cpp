#include "QuestSupervisorModule.h"
#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "WebSocketsModule.h"

IMPLEMENT_MODULE(FQuestSupervisorModule, QuestSupervisor)
DEFINE_LOG_CATEGORY(LogQuestSupervisor);

void FQuestSupervisorModule::StartupModule()
{
    FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor module started."));
}

void FQuestSupervisorModule::ShutdownModule()
{
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor module shut down."));
}
