import unreal


MAP_PATH = "/Game/VRTemplate/VRTemplateMap"
ACTOR_CLASS_PATH = "/Script/QuestSupervisor.QuestSupervisorCommandBridgeActor"
ACTOR_LABEL = "QuestSupervisorCommandBridge"


def main():
    unreal.log("QuestSupervisor: loading map {0}".format(MAP_PATH))
    unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH)

    actor_class = unreal.load_class(None, ACTOR_CLASS_PATH)
    if actor_class is None:
        raise RuntimeError("Could not load {0}".format(ACTOR_CLASS_PATH))

    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for actor in actor_subsystem.get_all_level_actors():
        if actor.get_actor_label() == ACTOR_LABEL or actor.get_class().get_name() == "QuestSupervisorCommandBridgeActor":
            unreal.log("QuestSupervisor: bridge actor already exists: {0}".format(actor.get_actor_label()))
            unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
            return

    actor = actor_subsystem.spawn_actor_from_class(
        actor_class,
        unreal.Vector(0.0, 0.0, 120.0),
        unreal.Rotator(0.0, 0.0, 0.0),
    )
    actor.set_actor_label(ACTOR_LABEL)
    unreal.log("QuestSupervisor: spawned {0}".format(actor.get_actor_label()))
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)


main()
