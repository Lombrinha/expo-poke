import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, SafeAreaView, TouchableOpacity, ScrollView, ImageBackground, Modal, Platform, TextInput } from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, orderBy, limit, getDocs, doc, getDoc, deleteDoc, serverTimestamp, where, updateDoc, runTransaction } from 'firebase/firestore';
interface Stat { base_stat: number; stat: { name: string } }
interface TypeData { name: string; url: string }
interface TypeRelations { double_damage_to: TypeData[]; half_damage_to: TypeData[]; no_damage_to: TypeData[] }
interface StatChange { change: number; stat: { name: string } }
interface EffectEntry { effect: string; short_effect: string; language: { name: string } }
interface Move {
  name: string; power: number | null; pp: number; maxPp: number; type: string; damage_class: string;
  typeRelations: TypeRelations | null; stat_changes: StatChange[];
  meta: { ailment: { name: string }; ailment_chance: number; healing: number; };
}
interface Ability { name: string; effect_entries: EffectEntry[] }
interface Pokemon {
  id: number; name: string; sprites: { front_default: string; back_default: string };
  stats: Stat[]; types: string[]; moves: Move[]; abilities: Ability[];
  currentHp: number; maxHp: number; isFainted: boolean;
  statStages: { [key: string]: number }; statusCondition: string | null;
  statusCounter: number;
}
interface Player { id: string; name: string; team: Pokemon[]; activePokemonIndex: number; selectedAction: { type: 'move' | 'switch'; payload: any } | null; }
interface BattleState {
    player1: Player;
    player2: Player;
    turn: 'selecting' | 'processing' | 'finished' | 'player1_must_switch' | 'player2_must_switch';
    log: string[];
    state: 'ongoing' | 'player1_wins' | 'player2_wins';
    lastTimestamp: any;
    revealedMoves: { [playerId: string]: string[] };
}
type TentativeAction = { type: 'move' | 'switch'; payload: any } | null;
type ScreenState = 'menu' | 'entering_name' | 'in_queue' | 'in_battle';
const POKEMON_API_BASE_URL = 'https://pokeapi.co/api/v2/';
const TOTAL_POKEMON = 898;
const LEVEL = 50;
const TURN_TIMEOUT_SECONDS = 30;
const BATTLE_MUSIC_FILES = [
  require('../assets/b1.mp3'), require('../assets/b2.mp3'),
  require('../assets/b3.mp3'), require('../assets/b4.mp3'),
  require('../assets/b5.mp3'),
];
const VICTORY_MUSIC_FILE = require('../assets/victory.mp3');
const TYPE_COLORS: { [key:string]: string } = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C',
  ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3',
  psychic: '#F95587', bug: '#A6B91A', rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC',
  dark: '#705746', steel: '#B7B7CE', fairy: '#D685AD',
};
const STATUS_COLORS: { [key:string]: string } = {
    poison: '#A33EA1',
    burn: '#EE8130',
    paralysis: '#F7D02C',
    sleep: '#A8A77A',
};
const BATTLE_BACKGROUND_IMAGE = 'https://i.pinimg.com/1200x/e2/84/b1/e284b14af595f046c749aea762b546a6.jpg';
const POKEBALL_ICON = require('../assets/R.png');
const firebaseConfig = {
  apiKey: "AIzaSyDDBbQnjLotHcpkhtfbCBT7pbkw68TsJlw",
  authDomain: "pokemonbattlegame-fff41.firebaseapp.com",
  projectId: "pokemonbattlegame-fff41",
  storageBucket: "pokemonbattlegame-fff41.firebasestorage.app",
  messagingSenderId: "500542363851",
  appId: "1:500542363851:web:3df57c4d4218f9748f234e"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const fetchPokemonData = async (id: number): Promise<Pokemon> => {
    const pokemonRes = await fetch(`${POKEMON_API_BASE_URL}pokemon/${id}`);
    const pokemonData = await pokemonRes.json();
    const animatedSprites = pokemonData.sprites.versions['generation-v']['black-white'].animated;
    const sprites = {
        front_default: animatedSprites.front_default || pokemonData.sprites.front_default,
        back_default: animatedSprites.back_default || pokemonData.sprites.back_default,
    };
    const movePromises = pokemonData.moves.map((m: any) => fetch(m.move.url).then(res => res.json())).sort(() => 0.5 - Math.random());
    const moveDetails = await Promise.all(movePromises.slice(0, 40));
    const movesWithDetails: Move[] = [];
    for (const md of moveDetails) {
        if (md.power && md.power > 0 && movesWithDetails.length < 4) {
            const typeRes = await fetch(md.type.url);
            const typeData = await typeRes.json();
            movesWithDetails.push({
                name: md.name.replace('-', ' '), power: md.power, pp: md.pp, maxPp: md.pp,
                type: md.type.name, damage_class: md.damage_class.name, typeRelations: typeData.damage_relations,
                stat_changes: md.stat_changes, meta: md.meta,
            });
        }
    }
    const abilityPromises = pokemonData.abilities.map(async (a: any) => {
        const res = await fetch(a.ability.url);
        const abilityData = await res.json();
        const englishEntry = abilityData.effect_entries.find((entry: EffectEntry) => entry.language.name === 'en');
        return { name: abilityData.name, effect_entries: [englishEntry || abilityData.effect_entries[0]] };
    });
    const abilities: Ability[] = await Promise.all(abilityPromises);
    const hpStat = pokemonData.stats.find((s: Stat) => s.stat.name === 'hp').base_stat;
    const maxHp = Math.floor(((2 * hpStat * LEVEL) / 100) + LEVEL + 10);
    return {
        id: pokemonData.id, name: pokemonData.name.charAt(0).toUpperCase() + pokemonData.name.slice(1),
        sprites: sprites, stats: pokemonData.stats, types: pokemonData.types.map((t: any) => t.type.name),
        abilities: abilities, moves: movesWithDetails, currentHp: maxHp, maxHp: maxHp, isFainted: false,
        statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 },
        statusCondition: null, statusCounter: 0,
    };
};
const generateRandomTeam = async (): Promise<Pokemon[]> => {
    const randomIds = new Set<number>();
    while (randomIds.size < 6) {
        randomIds.add(Math.floor(Math.random() * TOTAL_POKEMON) + 1);
    }
    return await Promise.all(Array.from(randomIds).map(id => fetchPokemonData(id)));
}
const getStageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
const calculateDamage = (attacker: Pokemon, defender: Pokemon, move: Move, log: string[]) => {
    let newDefender = { ...defender };
    
    const attackStatName = move.damage_class === 'physical' ? 'attack' : 'special-attack';
    const defenseStatName = move.damage_class === 'physical' ? 'defense' : 'special-defense';
    const attackStat = attacker.stats.find(s => s.stat.name === attackStatName)!.base_stat * getStageMultiplier(attacker.statStages[attackStatName]);
    const defenseStat = defender.stats.find(s => s.stat.name === defenseStatName)!.base_stat * getStageMultiplier(defender.statStages[defenseStatName]);
    let baseDamage = Math.floor(((((2 * LEVEL / 5) + 2) * move.power! * (attackStat / defenseStat)) / 50) + 2);
    let effectiveness = 1;
    if (move.typeRelations) {
        defender.types.forEach(defType => {
            if (move.typeRelations!.double_damage_to.some(t => t.name === defType)) effectiveness *= 2;
            if (move.typeRelations!.half_damage_to.some(t => t.name === defType)) effectiveness *= 0.5;
            if (move.typeRelations!.no_damage_to.some(t => t.name === defType)) effectiveness *= 0;
        });
    }
    if (effectiveness > 1) log.push("É super efetivo!");
    if (effectiveness < 1 && effectiveness > 0) log.push("Não é muito efetivo...");
    if (effectiveness === 0) log.push("Não teve efeito!");
    const damage = Math.floor(baseDamage * effectiveness);
    newDefender.currentHp = Math.max(0, newDefender.currentHp - damage);   
    if (move.meta && move.meta.ailment.name !== 'none' && !newDefender.statusCondition) {
        if (Math.random() * 100 < move.meta.ailment_chance) {
            newDefender.statusCondition = move.meta.ailment.name;
            log.push(`${newDefender.name} foi afetado por ${move.meta.ailment.name}!`);
        }
    }
    if (newDefender.currentHp <= 0) {
        newDefender.isFainted = true;
        log.push(`${newDefender.name} desmaiou!`);
    }
    return newDefender;
};
const HealthBar = ({ percentage }: { percentage: number }) => {
    const barColor = percentage > 50 ? '#00FF00' : percentage > 20 ? '#FFFF00' : '#FF0000';
    return (
        <View style={styles.healthBarOuter}>
            <View style={[styles.healthBarInner, { width: `${percentage}%`, backgroundColor: barColor }]} />
        </View>
    );
};
const InfoBox = ({ pokemon }: { pokemon: Pokemon }) => {
    if (!pokemon) return null;
    const hpPercentage = (pokemon.currentHp / pokemon.maxHp) * 100;
    return (
        <View style={styles.infoBox}>
            <View style={styles.infoBoxTop}>
                <Text style={styles.infoBoxName}>{pokemon.name}</Text>
                <Text style={styles.infoBoxLevel}>Lv{LEVEL}</Text>
                {pokemon.statusCondition && 
                    <View style={[styles.statusBadge, {backgroundColor: STATUS_COLORS[pokemon.statusCondition] || '#777'}]}>
                        <Text style={styles.statusBadgeText}>{pokemon.statusCondition.slice(0, 3).toUpperCase()}</Text>
                    </View>
                }
            </View>
            <View style={styles.infoBoxBottom}>
                <Text style={styles.hpLabel}>HP:</Text>
                <HealthBar percentage={hpPercentage} />
            </View>
            <Text style={styles.hpNumbers}>{Math.max(0, Math.ceil(pokemon.currentHp))} / {pokemon.maxHp}</Text>
        </View>
    );
};
const TeamStatus = ({ team, playerName }: { team: Pokemon[], playerName?: string }) => (
    <View style={styles.teamStatusContainer}>
        <View style={styles.pokeballRow}>
            {team.map((p, i) => (
                <Image key={i} source={POKEBALL_ICON} style={[styles.pokeballIcon, p.isFainted && styles.faintedPokeball]} />
            ))}
        </View>
        {playerName && <Text style={styles.playerNameText}>{playerName}</Text>}
    </View>
);
const SwitchPokemonButton = ({ pokemon, onPress, isActive, isFainted, isTentative }: { pokemon: Pokemon, onPress: () => void, isActive: boolean, isFainted: boolean, isTentative: boolean }) => {
    const hpPercentage = (pokemon.currentHp / pokemon.maxHp) * 100;
    const barColor = hpPercentage > 50 ? '#00FF00' : hpPercentage > 20 ? '#FFFF00' : '#FF0000';
    const buttonStyle = [
        styles.switchPokemonButton,
        isFainted ? styles.faintedSwitchButton : null,
        isActive ? styles.activeSwitchButton : null,
        isTentative ? styles.tentativeActionButton : null,
    ];
    return (
        <TouchableOpacity onPress={onPress} disabled={isFainted || isActive} style={buttonStyle}>
            <Image source={{ uri: pokemon.sprites.front_default }} style={styles.switchPokemonSprite} />
            <View style={styles.switchPokemonInfo}>
                <Text style={styles.switchPokemonName}>{pokemon.name}</Text>
                <View style={styles.switchHpBarContainer}>
                    <View style={[styles.switchHpBar, { width: `${hpPercentage}%`, backgroundColor: barColor }]} />
                </View>
            </View>
        </TouchableOpacity>
    );
};
const PokemonDetailsModal = ({ pokemon, visible, onClose, isOpponent, revealedMoves }: { pokemon: Pokemon | null, visible: boolean, onClose: () => void, isOpponent: boolean, revealedMoves: string[] }) => {
    if (!visible || !pokemon) return null;
    const movesToShow = isOpponent 
        ? pokemon.moves.filter(move => revealedMoves.includes(move.name))
        : pokemon.moves;
    return (
        <Modal transparent={true} animationType="fade" visible={visible} onRequestClose={onClose}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{pokemon.name}</Text>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailTitle}>Tipos:</Text>
                        <View style={styles.typesContainer}>
                            {pokemon.types.map(type => (
                                <View key={type} style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[type] || '#A8A77A' }]}>
                                    <Text style={styles.typeBadgeText}>{type.toUpperCase()}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailTitle}>Movimentos:</Text>
                        {movesToShow.map(move => (
                            <Text key={move.name} style={styles.detailText}>{move.name} - PP {move.pp}/{move.maxPp}</Text>
                        ))}
                        {isOpponent && movesToShow.length === 0 && <Text style={styles.detailText}>Nenhum movimento revelado.</Text>}
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};
const BattleScreen = ({ onExitBattle, battleId, playerId }: { onExitBattle: (battleId: string) => void; battleId: string; playerId: string; }) => {
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [tentativeAction, setTentativeAction] = useState<TentativeAction>(null);
    const [modalInfo, setModalInfo] = useState<{ pokemon: Pokemon | null; isOpponent: boolean; visible: boolean; }>({ pokemon: null, isOpponent: false, visible: false });
    const scrollViewRef = useRef<ScrollView>(null);
    const battleMusicRef = useRef<Audio.Sound | null>(null);
    const victoryMusicRef = useRef<Audio.Sound | null>(null);
    const lastActionTimestamp = useRef<any>(null);
    const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useFocusEffect(
        useCallback(() => {
            let isMounted = true;
            const loadSounds = async () => {
                try {
                    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
                    const { sound: victorySound } = await Audio.Sound.createAsync(VICTORY_MUSIC_FILE, { isLooping: false });
                    const randomMusicFile = BATTLE_MUSIC_FILES[Math.floor(Math.random() * BATTLE_MUSIC_FILES.length)];
                    const { sound: newBattleMusic } = await Audio.Sound.createAsync(randomMusicFile, { isLooping: true });
                    
                    if (isMounted) {
                        victoryMusicRef.current = victorySound;
                        battleMusicRef.current = newBattleMusic;
                        await battleMusicRef.current.playAsync();
                    }
                } catch (e) { console.error("Falha ao carregar sons", e); }
            };
            loadSounds();
            return () => {
                isMounted = false;
                battleMusicRef.current?.unloadAsync();
                victoryMusicRef.current?.unloadAsync();
            };
        }, [])
    );
    const handleTurnTimeout = useCallback(async () => {
        const battleDocRef = doc(db, "battles", battleId);
        try {
            await runTransaction(db, async (transaction) => {
                const freshBattleDoc = await transaction.get(battleDocRef);
                if (!freshBattleDoc.exists()) return;
                const currentBattleState = freshBattleDoc.data() as BattleState;
                if (currentBattleState.turn !== 'selecting') return;
                let winnerKey: 'player1_wins' | 'player2_wins' | null = null;
                let loserName = '';
                if (!currentBattleState.player1.selectedAction && !currentBattleState.player2.selectedAction) {
                    winnerKey = 'player2_wins';
                    loserName = currentBattleState.player1.name;
                } else if (!currentBattleState.player1.selectedAction) {
                    winnerKey = 'player2_wins';
                    loserName = currentBattleState.player1.name;
                } else if (!currentBattleState.player2.selectedAction) {
                    winnerKey = 'player1_wins';
                    loserName = currentBattleState.player2.name;
                }
                if (winnerKey) {
                    transaction.update(battleDocRef, {
                        state: winnerKey,
                        turn: 'finished',
                        log: [...currentBattleState.log, `${loserName} não escolheu uma ação a tempo!`]
                    });
                }
            });
        } catch (error) {
            console.error("Erro ao processar o timeout do turno:", error);
        }
    }, [battleId]);
    useEffect(() => {
        const battleDocRef = doc(db, "battles", battleId);
        const unsubscribe = onSnapshot(battleDocRef, (doc) => {
            if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
            if (doc.exists()) {
                const data = doc.data() as BattleState;
                setBattleState(data);
                if (data.turn === 'selecting' && data.state === 'ongoing') {
                    setTentativeAction(null);
                    turnTimerRef.current = setTimeout(handleTurnTimeout, TURN_TIMEOUT_SECONDS * 1000);
                }
                if (data.state.includes('wins')) {
                    battleMusicRef.current?.stopAsync();
                    const playerWon = (data.state === 'player1_wins' && data.player1.id === playerId) ||
                                    (data.state === 'player2_wins' && data.player2.id === playerId);
                    if(playerWon) victoryMusicRef.current?.replayAsync();
                }
            } else {
                onExitBattle(battleId);
            }
        });
        return () => {
            if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
            unsubscribe();
        }
    }, [battleId, playerId, onExitBattle, handleTurnTimeout]);
    useEffect(() => {
        if (!battleState || battleState.turn !== 'processing' || battleState.lastTimestamp === lastActionTimestamp.current) {
            return;
        }
        const processTurn = async () => {
            lastActionTimestamp.current = battleState.lastTimestamp;
            const battleDocRef = doc(db, "battles", battleId);
            await runTransaction(db, async (transaction) => {
                const freshBattleDoc = await transaction.get(battleDocRef);
                if (!freshBattleDoc.exists()) return;
                let newState = JSON.parse(JSON.stringify(freshBattleDoc.data()));
                let log = [...newState.log];
                const p1 = newState.player1;
                const p2 = newState.player2;
                if (p1.selectedAction.type === 'switch') {
                    p1.activePokemonIndex = p1.selectedAction.payload;
                    log.push(`${p1.name} trocou para ${p1.team[p1.activePokemonIndex].name}!`);
                }
                if (p2.selectedAction.type === 'switch') {
                    p2.activePokemonIndex = p2.selectedAction.payload;
                    log.push(`${p2.name} trocou para ${p2.team[p2.activePokemonIndex].name}!`);
                }
                const p1Poke = p1.team[p1.activePokemonIndex];
                const p2Poke = p2.team[p2.activePokemonIndex];
                const p1Speed = p1Poke.stats.find((s: Stat) => s.stat.name === 'speed')!.base_stat;
                const p2Speed = p2Poke.stats.find((s: Stat) => s.stat.name === 'speed')!.base_stat;
                const firstPlayer = p1Speed >= p2Speed ? p1 : p2;
                const secondPlayer = p1Speed < p2Speed ? p1 : p2;
                const executeAttack = (attacker: Player, defender: Player) => {
                    if (attacker.selectedAction?.type !== 'move') return false;
                    const attackerPoke = attacker.team[attacker.activePokemonIndex];
                    if (attackerPoke.isFainted || defender.team[defender.activePokemonIndex].isFainted) return false;
                    const moveIndex = attackerPoke.moves.findIndex(m => m.name === attacker.selectedAction!.payload);
                    if (moveIndex === -1 || attackerPoke.moves[moveIndex].pp === 0) return false;
                    const move = attackerPoke.moves[moveIndex];
                    attackerPoke.moves[moveIndex].pp -= 1;
                    log.push(`${attackerPoke.name} usou ${move.name}!`);
                    if (!newState.revealedMoves[attacker.id].includes(move.name)) {
                        newState.revealedMoves[attacker.id].push(move.name);
                    }
                    defender.team[defender.activePokemonIndex] = calculateDamage(attackerPoke, defender.team[defender.activePokemonIndex], move, log);
                    return defender.team[defender.activePokemonIndex].isFainted;
                };                
                const defenderFainted = executeAttack(firstPlayer, secondPlayer);
                if (!defenderFainted) {
                    executeAttack(secondPlayer, firstPlayer);
                }                
                const applyEndOfTurnStatusDamage = (player: Player) => {
                    const poke = player.team[player.activePokemonIndex];
                    if (poke.isFainted || !poke.statusCondition) return;
                    if (poke.statusCondition === 'poison' || poke.statusCondition === 'burn') {
                        const damage = Math.floor(poke.maxHp / 8);
                        poke.currentHp = Math.max(0, poke.currentHp - damage);
                        log.push(`${poke.name} foi ferido por ${poke.statusCondition}!`);
                        if (poke.currentHp <= 0) {
                            poke.isFainted = true;
                            log.push(`${poke.name} desmaiou!`);
                        }
                    }
                }
                applyEndOfTurnStatusDamage(p1);
                applyEndOfTurnStatusDamage(p2);
                const p1Fainted = p1.team.every((p: Pokemon) => p.isFainted);
                const p2Fainted = p2.team.every((p: Pokemon) => p.isFainted);               
                newState.player1.selectedAction = null;
                newState.player2.selectedAction = null;
                newState.log = log;
                if (p1Fainted) {
                    newState.state = 'player2_wins';
                    newState.turn = 'finished';
                    log.push(`${p2.name} venceu a batalha!`);
                } else if (p2Fainted) {
                    newState.state = 'player1_wins';
                    newState.turn = 'finished';
                    log.push(`${p1.name} venceu a batalha!`);
                } else if (p1.team[p1.activePokemonIndex].isFainted) {
                    newState.turn = 'player1_must_switch';
                } else if (p2.team[p2.activePokemonIndex].isFainted) {
                    newState.turn = 'player2_must_switch';
                } else {
                    newState.turn = 'selecting';
                }
                transaction.set(battleDocRef, newState);
            });
        };
        processTurn();
    }, [battleState, battleId]);
    const handleAction = async (action: TentativeAction) => {
        if (!action || !battleState) return;       
        const playerKey = battleState.player1.id === playerId ? 'player1' : 'player2';
        const battleDocRef = doc(db, "battles", battleId);
        if (battleState.turn.includes('_must_switch')) {
            if (action.type === 'switch') {
                const updateData: any = {};
                updateData[`${playerKey}.activePokemonIndex`] = action.payload;
                updateData.turn = 'selecting';
                await updateDoc(battleDocRef, updateData);
            }
        } else if (battleState.turn === 'selecting') {
            try {
                await runTransaction(db, async (transaction) => {
                    const freshBattleDoc = await transaction.get(battleDocRef);
                    if (!freshBattleDoc.exists()) throw "Batalha não encontrada";
                    const currentBattleState = freshBattleDoc.data() as BattleState;
                    const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
                    
                    const updateData: any = {};
                    updateData[`${playerKey}.selectedAction`] = action;

                    if (currentBattleState[opponentKey].selectedAction) {
                        if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
                        updateData.turn = 'processing';
                        updateData.lastTimestamp = serverTimestamp();
                    }
                    
                    transaction.update(battleDocRef, updateData);
                });
            } catch (error) {
                console.error("Erro ao confirmar ação: ", error);
            }
        }
    };
    if (!battleState) {
        return <View style={styles.centered}><ActivityIndicator size="large" color="#fff" /><Text style={styles.queueText}>Carregando Batalha...</Text></View>;
    }
    const player = battleState.player1.id === playerId ? battleState.player1 : battleState.player2;
    const opponent = battleState.player1.id === playerId ? battleState.player2 : battleState.player1;
    const playerKey = battleState.player1.id === playerId ? 'player1' : 'player2';    
    const activePlayerPokemon = player.team[player.activePokemonIndex];
    const activeOpponentPokemon = opponent.team[opponent.activePokemonIndex];  
    const isFinished = battleState.state.includes('wins');
    const hasPlayerConfirmed = !!player.selectedAction;
    const mustPlayerSwitch = battleState.turn === `${playerKey}_must_switch`;
    const renderActionPanel = () => {
        if (isFinished) {
            const playerWon = (battleState.state === 'player1_wins' && player.id === battleState.player1.id) ||
                              (battleState.state === 'player2_wins' && player.id === battleState.player2.id);
            return (
                <View style={styles.centered}>
                    <Text style={styles.menuTitle}>{playerWon ? "Você Venceu!" : "Você Perdeu!"}</Text>
                    <TouchableOpacity style={styles.playAgainButton} onPress={() => onExitBattle(battleId)}><Text style={styles.actionText}>Voltar ao Menu</Text></TouchableOpacity>
                </View>
            );
        }
        if (mustPlayerSwitch) {
            return (
                <View style={styles.actionPanelContainer}>
                    <Text style={styles.whatWillDoText}>Escolha o seu próximo Pokémon!</Text>
                    <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switchPanel}>
                        {player.team.map((pokemon, index) => (
                            <SwitchPokemonButton
                                key={index}
                                pokemon={pokemon}
                                onPress={() => handleAction({ type: 'switch', payload: index })}
                                isActive={index === player.activePokemonIndex}
                                isFainted={pokemon.isFainted}
                                isTentative={false}
                            />
                        ))}
                    </ScrollView>
                </View>
            );
        }
        if (battleState.turn.includes('_must_switch') && !mustPlayerSwitch) {
            return <View style={styles.centered}><Text style={styles.queueText}>Aguardando oponente trocar...</Text><ActivityIndicator size="large" color="#fff" /></View>;
        }
        if (hasPlayerConfirmed) {
             return <View style={styles.centered}><Text style={styles.queueText}>Aguardando oponente...</Text><ActivityIndicator size="large" color="#fff" /></View>;
        }
        if (tentativeAction) {
            return (
                <View style={styles.confirmationContainer}>
                    <Text style={styles.confirmationText}>
                        {tentativeAction.type === 'move' ? `Usar ${tentativeAction.payload}?` : `Trocar para ${player.team[tentativeAction.payload].name}?`}
                    </Text>
                    <View style={styles.confirmationButtons}>
                        <TouchableOpacity style={[styles.confirmButton, styles.cancelButton]} onPress={() => setTentativeAction(null)}>
                            <Text style={styles.actionText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.confirmButton} onPress={() => handleAction(tentativeAction)}>
                            <Text style={styles.actionText}>Confirmar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )
        }
        return (
            <View style={styles.actionPanelContainer}>
                <View>
                    <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switchPanel}>
                        {player.team.map((pokemon, index) => (
                            <SwitchPokemonButton
                                key={index}
                                pokemon={pokemon}
                                onPress={() => setTentativeAction({ type: 'switch', payload: index })}
                                isActive={index === player.activePokemonIndex}
                                isFainted={pokemon.isFainted}
                                isTentative={false}
                            />
                        ))}
                    </ScrollView>
                </View>
                <View style={styles.movePanel}>
                    <Text style={styles.whatWillDoText}>O que {activePlayerPokemon.name} fará?</Text>
                    <View style={styles.moveGrid}>
                        {activePlayerPokemon.moves.map(move => (
                            <TouchableOpacity 
                                key={move.name} 
                                style={[
                                    styles.actionButton, 
                                    {backgroundColor: TYPE_COLORS[move.type] || '#A8A77A'},
                                ]} 
                                onPress={() => setTentativeAction({ type: 'move', payload: move.name })} 
                                disabled={move.pp === 0}
                            >
                                <Text style={styles.actionText}>{move.name}</Text>
                                <Text style={styles.ppText}>{move.type.toUpperCase()}</Text>
                                <Text style={styles.ppText}>PP {move.pp}/{move.maxPp}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>
        );
    };
    return (
        <View style={styles.container}>
            <ImageBackground source={{ uri: BATTLE_BACKGROUND_IMAGE }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.battleArea}>
                    <TouchableOpacity onLongPress={() => setModalInfo({ pokemon: activeOpponentPokemon, isOpponent: true, visible: true })} style={styles.opponentSide}>
                        <View style={styles.opponentInfoContainer}>
                            <TeamStatus team={opponent.team} playerName={opponent.name} />
                            <InfoBox pokemon={activeOpponentPokemon} />
                        </View>
                        <View>
                            <Image source={{ uri: activeOpponentPokemon.sprites.front_default }} style={styles.pokemonSprite} />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onLongPress={() => setModalInfo({ pokemon: activePlayerPokemon, isOpponent: false, visible: true })} style={styles.playerSide}>
                        <View>
                            <Image source={{ uri: activePlayerPokemon.sprites.back_default }} style={[styles.pokemonSprite, styles.playerSprite]} />
                        </View>
                        <View style={styles.playerInfoContainer}>
                            <InfoBox pokemon={activePlayerPokemon} />
                            <TeamStatus team={player.team} playerName={player.name} />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={styles.controlsContainer}>
                    <View style={styles.actionsPanel}>
                        {renderActionPanel()}
                    </View>
                    <View style={styles.logContainer}>
                        <ScrollView ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
                            {battleState.log.slice(-10).map((msg, index) => <Text key={index} style={styles.logText}>{msg}</Text>)}
                        </ScrollView>
                    </View>
                </View>
            </SafeAreaView>
            <PokemonDetailsModal 
                pokemon={modalInfo.pokemon}
                visible={modalInfo.visible}
                onClose={() => setModalInfo({ pokemon: null, isOpponent: false, visible: false })}
                isOpponent={modalInfo.isOpponent}
                revealedMoves={battleState.revealedMoves ? battleState.revealedMoves[opponent.id] || [] : []}
            />
        </View>
    );
}
export default function App() {
    const [screen, setScreen] = useState<ScreenState>('menu');
    const [playerName, setPlayerName] = useState('');
    const [tempPlayerName, setTempPlayerName] = useState('');
    const [queueCount, setQueueCount] = useState(0);
    const [battleInfo, setBattleInfo] = useState<{ battleId: string; } | null>(null);
    const playerIdRef = useRef<string>(doc(collection(db, 'temp')).id);
    const handleEnterMultiplayer = () => {
        setScreen('entering_name');
    };
    const handleNameSubmit = async () => {
        if (tempPlayerName.trim()) {
            const name = tempPlayerName.trim();
            const id = playerIdRef.current;
            setPlayerName(name);
            setScreen('in_queue');
            const queueRef = collection(db, "queue");
            try {
                await runTransaction(db, async (transaction) => {
                    const q = query(queueRef, orderBy("timestamp"), limit(1));
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty && querySnapshot.docs[0].id !== id) {
                        const opponentDoc = querySnapshot.docs[0];
                        const opponentData = opponentDoc.data();
                        
                        const player1Team = await generateRandomTeam();
                        const player2Team = await generateRandomTeam();

                        const battleDocRef = doc(collection(db, "battles"));
                        
                        const newBattleState: BattleState = {
                            player1: { id: opponentDoc.id, name: opponentData.name, team: player1Team, activePokemonIndex: 0, selectedAction: null },
                            player2: { id: id, name: name, team: player2Team, activePokemonIndex: 0, selectedAction: null },
                            turn: 'selecting',
                            log: [`A batalha entre ${opponentData.name} e ${name} começou!`],
                            state: 'ongoing',
                            lastTimestamp: serverTimestamp(),
                            revealedMoves: { [opponentDoc.id]: [], [id]: [] }
                        };

                        transaction.set(battleDocRef, newBattleState);
                        transaction.delete(opponentDoc.ref);
                    } else {
                        const playerDocRef = doc(queueRef, id);
                        transaction.set(playerDocRef, { name: name, timestamp: serverTimestamp() });
                    }
                });
            } catch (error) {
                console.error("Transação da fila falhou: ", error);
                setScreen('menu');
            }
        }
    };
    const onExitBattle = useCallback(async (battleId: string) => {
        const battleDocRef = doc(db, "battles", battleId);
        const battleDoc = await getDoc(battleDocRef);
        if (battleDoc.exists()) {
            const battleData = battleDoc.data() as BattleState;
            if (battleData.state === 'ongoing') {
                const winnerId = battleData.player1.id === playerIdRef.current ? battleData.player2.id : battleData.player1.id;
                const winnerKey = battleData.player1.id === winnerId ? 'player1_wins' : 'player2_wins';
                await updateDoc(battleDocRef, {
                    state: winnerKey,
                    turn: 'finished',
                    log: [...battleData.log, `${playerName || 'O jogador'} saiu da partida.`]
                });
            } else {
                 if ((battleData.state === 'player1_wins' && battleData.player1.id === playerIdRef.current) ||
                     (battleData.state === 'player2_wins' && battleData.player2.id === playerIdRef.current)) {
                     await deleteDoc(battleDocRef);
                 }
            }
        }      
        setBattleInfo(null);
        setScreen('menu');
    }, [playerName]);
    useEffect(() => {
        if (screen !== 'in_queue') return;

        const id = playerIdRef.current;
        const battlesRef = collection(db, "battles");
        
        const q1 = query(battlesRef, where('player1.id', '==', id));
        const unsub1 = onSnapshot(q1, (snapshot) => {
            if (!snapshot.empty) {
                const battleDoc = snapshot.docs[0];
                setBattleInfo({ battleId: battleDoc.id });
                setScreen('in_battle');
            }
        });
        const q2 = query(battlesRef, where('player2.id', '==', id));
        const unsub2 = onSnapshot(q2, (snapshot) => {
            if (!snapshot.empty) {
                const battleDoc = snapshot.docs[0];
                setBattleInfo({ battleId: battleDoc.id });
                setScreen('in_battle');
            }
        });
        const queueRef = collection(db, "queue");
        const unsubQueue = onSnapshot(queueRef, (snapshot) => {
            setQueueCount(snapshot.size);
        });

        return () => {
            unsub1();
            unsub2();
            unsubQueue();
        };
    }, [screen]);
    useEffect(() => {
        return () => {
            if(screen === 'in_queue') {
                const queueDocRef = doc(db, "queue", playerIdRef.current);
                deleteDoc(queueDocRef);
            }
        }
    }, [screen])
    if (screen === 'menu') {
        return (
            <View style={styles.menuContainer}>
                <Text style={styles.menuTitle}>Batalha Pokémon</Text>
                <TouchableOpacity style={styles.menuButton} onPress={handleEnterMultiplayer}>
                    <Text style={styles.menuButtonText}>Batalha Multiplayer</Text>
                </TouchableOpacity>
            </View>
        );
    }
    if (screen === 'entering_name') {
        return (
            <View style={styles.menuContainer}>
                <Text style={styles.menuTitle}>Digite seu Nome</Text>
                <TextInput
                    style={styles.nameInput}
                    placeholder="Nome de Treinador"
                    placeholderTextColor="#888"
                    value={tempPlayerName}
                    onChangeText={setTempPlayerName}
                />
                <TouchableOpacity style={styles.menuButton} onPress={handleNameSubmit}>
                    <Text style={styles.menuButtonText}>Procurar Batalha</Text>
                </TouchableOpacity>
            </View>
        );
    }
    if (screen === 'in_queue') {
        return (
            <View style={styles.centered}>
                <Text style={styles.queueText}>Procurando oponente...</Text>
                <Text style={styles.queueText}>Jogadores na fila: {queueCount}</Text>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }
    if (screen === 'in_battle' && battleInfo) {
        return <BattleScreen
            onExitBattle={onExitBattle}
            battleId={battleInfo.battleId}
            playerId={playerIdRef.current}
        />;
    }

    return null;
};
const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
    battleArea: { flex: 1, position: 'relative' },
    opponentSide: { position: 'absolute', top: '5%', right: '5%', alignItems: 'center', flexDirection: 'row' },
    playerSide: { position: 'absolute', bottom: '5%', left: '5%', alignItems: 'center', flexDirection: 'row' },
    pokemonSprite: { width: 150, height: 150, resizeMode: 'contain' },
    playerSprite: { width: 180, height: 180 },
    opponentInfoContainer: { alignItems: 'flex-end' },
    playerInfoContainer: { alignItems: 'flex-start' },
    infoBox: { backgroundColor: 'rgba(0, 0, 0, 0.7)', borderRadius: 8, padding: 8, marginHorizontal: 10, width: 220, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    infoBoxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    infoBoxName: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    infoBoxLevel: { color: 'white', fontSize: 14 },
    infoBoxBottom: { flexDirection: 'row', alignItems: 'center' },
    hpLabel: { color: '#FFCB05', fontWeight: 'bold', fontSize: 12, marginRight: 4 },
    healthBarOuter: { flex: 1, height: 10, backgroundColor: '#555', borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
    healthBarInner: { height: '100%', borderRadius: 4 },
    hpNumbers: { color: 'white', fontSize: 12, alignSelf: 'flex-end', marginTop: 2, fontWeight: '600' },
    teamStatusContainer: { alignItems: 'center', marginVertical: 5 },
    pokeballRow: { flexDirection: 'row' },
    pokeballIcon: { width: 20, height: 20, marginHorizontal: 2 },
    faintedPokeball: { opacity: 0.3 },
    playerNameText: { color: 'white', fontWeight: 'bold', marginTop: 4, textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: {width: -1, height: 1}, textShadowRadius: 10 },
    controlsContainer: { height: 280, flexDirection: 'row', borderTopWidth: 4, borderColor: '#000', backgroundColor: 'rgba(51, 51, 51, 0.8)' },
    actionsPanel: { flex: 1.5, padding: 8, borderRightWidth: 2, borderColor: '#000' },
    logContainer: { flex: 1, padding: 8, backgroundColor: 'rgba(0,0,0,0.2)' },
    logText: { color: 'white', fontSize: 14, marginBottom: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    actionPanelContainer: { flex: 1, justifyContent: 'space-between' },
    switchPanel: { paddingVertical: 4 },
    movePanel: {},
    disabledPanel: { opacity: 0.5 },
    whatWillDoText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginBottom: 8, textAlign: 'center' },
    moveGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
    actionButton: { width: '48%', borderRadius: 8, paddingVertical: 8, marginVertical: 4, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
    actionText: { color: 'white', fontWeight: 'bold', textTransform: 'capitalize', textAlign: 'center', fontSize: 14 },
    ppText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, textTransform: 'uppercase', marginTop: 2 },
    playAgainButton: { backgroundColor: '#2196F3', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', elevation: 5 },
    switchPokemonButton: { alignItems: 'center', backgroundColor: '#444', borderRadius: 8, padding: 4, marginHorizontal: 3, width: 90, borderWidth: 1, borderColor: '#666' },
    activeSwitchButton: { borderColor: '#00BFFF', borderWidth: 2 },
    faintedSwitchButton: { backgroundColor: '#555', opacity: 0.6 },
    switchPokemonSprite: { width: 50, height: 50 },
    switchPokemonInfo: { alignItems: 'center', width: '100%' },
    switchPokemonName: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    switchHpBarContainer: { height: 6, width: '80%', backgroundColor: '#222', borderRadius: 3, marginTop: 2 },
    switchHpBar: { height: '100%', borderRadius: 3 },
    statusBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 5 },
    statusBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    menuContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
    menuTitle: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 40 },
    menuButton: { backgroundColor: '#2196F3', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, marginVertical: 10 },
    menuButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    nameInput: { backgroundColor: '#333', color: 'white', width: '80%', padding: 15, borderRadius: 10, fontSize: 16, textAlign: 'center', marginBottom: 20 },
    queueText: { fontSize: 24, color: 'white', marginBottom: 20, textAlign: 'center' },
    tentativeActionButton: { borderColor: '#FFCB05', borderWidth: 2 },
    confirmationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    confirmationText: { fontSize: 18, color: 'white', fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    confirmationButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    confirmButton: { backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
    cancelButton: { backgroundColor: '#F44336' },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)' },
    modalContent: { backgroundColor: '#2d2d2d', borderRadius: 10, padding: 20, width: '80%', borderWidth: 2, borderColor: '#555' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 15, textAlign: 'center' },
    detailSection: { marginBottom: 10 },
    detailTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFCB05', marginBottom: 5 },
    detailText: { fontSize: 14, color: 'white', textTransform: 'capitalize' },
    typesContainer: { flexDirection: 'row' },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, marginRight: 5 },
    typeBadgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
});