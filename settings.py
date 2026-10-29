"""Shared, bounded settings contract for the overlay and native agent."""
PRESETS = ('Easy', 'Hard', 'Brutal', 'Insane')
# Default, minimum, maximum. All values are integers at the RPC boundary.
SCHEMA = {
    'damagePreset': (1, 0, 3), 'healthPreset': (3, 0, 3),
    'legendaryStart': (0, 0, 30), 'legendaryInterval': (10, 1, 30),
    'bossInterval': (120, 60, 600), 'eventMask': (15, 0, 15),
    'eventFirst': (45, 10, 300), 'eventGapMin': (35, 10, 300),
    'eventGapMax': (60, 10, 300),
    'treasureDuration': (30, 10, 120), 'huntDuration': (20, 10, 120),
    'berserkerDuration': (20, 10, 120), 'stormDuration': (30, 10, 120),
    'banLuck': (1, 0, 1), 'rerollCap': (1000, 100, 1000),
    'pickupInterval': (25, 10, 120), 'chestInterval': (75, 30, 300),
    'rewardEvery': (3, 1, 10), 'soundEnabled': (1, 0, 1),
    'hazardPattern': (0, 0, 5), 'extraHazards': (1, 0, 1),
    'hazardPreset': (1, 0, 3), 'hazardGrowth': (0, 0, 10),
    'hazardCount': (6, 1, 16), 'hazardInterval': (10, 3, 60),
    'stormCount': (8, 1, 16), 'stormIntervalTenths': (25, 10, 100),
    'barrageCount': (8, 1, 16), 'barrageIntervalTenths': (30, 10, 100),
    'barrageDuration': (30, 10, 120), 'campSeconds': (6, 3, 30),
}
DEFAULTS = {key: spec[0] for key, spec in SCHEMA.items()}
CONTROLS = dict(waves=True, events=True, hazards=True, fireworks=True, autoEndless=True, autoMap=True)

def validate_settings(value):
    return (isinstance(value, dict) and set(value) == set(SCHEMA)
            and all(type(value[k]) is int and lo <= value[k] <= hi
                    for k, (_, lo, hi) in SCHEMA.items())
            and value['eventGapMin'] <= value['eventGapMax'])

def migrate_settings(value):
    result = dict(DEFAULTS)
    if isinstance(value, dict):
        for key, (_, lo, hi) in SCHEMA.items():
            if type(value.get(key)) is int and lo <= value[key] <= hi:
                result[key] = value[key]
    return result if validate_settings(result) else dict(DEFAULTS)
