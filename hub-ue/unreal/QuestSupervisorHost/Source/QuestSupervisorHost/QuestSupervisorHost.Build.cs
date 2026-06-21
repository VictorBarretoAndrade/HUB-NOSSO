using UnrealBuildTool;

public class QuestSupervisorHost : ModuleRules
{
    public QuestSupervisorHost(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(
            new[]
            {
                "Core",
                "CoreUObject",
                "Engine",
                "QuestSupervisor"
            });
    }
}
