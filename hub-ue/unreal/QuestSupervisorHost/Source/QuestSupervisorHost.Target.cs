using UnrealBuildTool;
using System.Collections.Generic;

public class QuestSupervisorHostTarget : TargetRules
{
    public QuestSupervisorHostTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

        ExtraModuleNames.AddRange(
            new[]
            {
                "QuestSupervisorHost"
            });
    }
}
