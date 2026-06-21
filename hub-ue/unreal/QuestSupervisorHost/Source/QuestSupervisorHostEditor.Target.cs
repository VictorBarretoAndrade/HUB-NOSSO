using UnrealBuildTool;
using System.Collections.Generic;

public class QuestSupervisorHostEditorTarget : TargetRules
{
    public QuestSupervisorHostEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

        ExtraModuleNames.AddRange(
            new[]
            {
                "QuestSupervisorHost"
            });
    }
}
