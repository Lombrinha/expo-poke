import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
interface Stat { base_stat: number; stat: { name: string } }
interface TypeData { name: string; url: string }
interface TypeRelations { double_damage_to: TypeData[]; half_damage_to: TypeData[]; no_damage_to: TypeData[] }
interface StatChange { change: number; stat: { name: string } }
interface EffectEntry { effect: string; short_effect: string; language: { name: string } }
interface Move {
  name: string; power: number | null; pp: number; maxPp: number; type: string; damage_class: string;
  typeRelations: TypeRelations | null; stat_changes: StatChange[]; meta: { ailment: { name: string }; ailment_chance: number };
}
interface Ability { name: string; effect_entries: EffectEntry[] }
interface Pokemon {
  id: number; name: string; sprites: { front_default: string; back_default: string };
  stats: Stat[]; types: string[]; moves: Move[]; abilities: Ability[];
  currentHp: number; maxHp: number; isFainted: boolean;
  statStages: { [key: string]: number }; statusCondition: string | null;
}
type GameState = 'loading' | 'player_turn' | 'opponent_turn' | 'awaiting_switch' | 'finished';
type StatName = 'attack' | 'defense' | 'special-attack' | 'special-defense' | 'speed';
const POKEMON_API_BASE_URL = 'https://pokeapi.co/api/v2/';
const TOTAL_POKEMON = 898;
const LEVEL = 50;
const BATTLE_MUSIC_FILES = [
  require('../assets/b1.mp3'), require('../assets/b2.mp3'),
  require('../assets/b3.mp3'), require('../assets/b4.mp3'),
  require('../assets/b5.mp3'),
];
const VICTORY_MUSIC_FILE = require('../assets/victory.mp3');
const TYPE_COLORS: { [key: string]: string } = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C',
  ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3',
  psychic: '#F95587', bug: '#A6B91A', rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC',
  dark: '#705746', steel: '#B7B7CE', fairy: '#D685AD',
};
const fetchPokemonData = async (id: number): Promise<Pokemon> => {
  const pokemonRes = await fetch(`${POKEMON_API_BASE_URL}pokemon/${id}`);
  const pokemonData = await pokemonRes.json();
  const movePromises = pokemonData.moves.map((m: any) => fetch(m.move.url).then(res => res.json())).sort(() => 0.5 - Math.random());
  const moveDetails = await Promise.all(movePromises.slice(0, 20));
  const movesWithDetails: Move[] = [];
  for (const md of moveDetails) {
    if ((md.power !== null || md.damage_class.name === 'status') && movesWithDetails.length < 4) {
      const typeRes = await fetch(md.type.url);
      const typeData = await typeRes.json();
      movesWithDetails.push({
        name: md.name.replace('-', ' '), power: md.power, pp: md.pp, maxPp: md.pp,
        type: md.type.name, damage_class: md.damage_class.name, typeRelations: typeData.damage_relations,
        stat_changes: md.stat_changes, meta: md.meta,
      });
    }
  }
  const abilityPromises = pokemonData.abilities.map((a: any) => fetch(a.ability.url).then(res => res.json()));
  const abilities: Ability[] = await Promise.all(abilityPromises);
  const hpStat = pokemonData.stats.find((s: Stat) => s.stat.name === 'hp').base_stat;
  const maxHp = Math.floor(((2 * hpStat * LEVEL) / 100) + LEVEL + 10);
  return {
    id: pokemonData.id, name: pokemonData.name.charAt(0).toUpperCase() + pokemonData.name.slice(1),
    sprites: pokemonData.sprites, stats: pokemonData.stats, types: pokemonData.types.map((t: any) => t.type.name),
    abilities: abilities, moves: movesWithDetails, currentHp: maxHp, maxHp: maxHp, isFainted: false,
    statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 },
    statusCondition: null,
  };
};
const getStageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
const calculateDamage = (attacker: Pokemon, defender: Pokemon, move: Move) => {
  let messages: string[] = [];
  const attackStatName = move.damage_class === 'physical' ? 'attack' : 'special-attack';
  const defenseStatName = move.damage_class === 'physical' ? 'defense' : 'special-defense';
  const attackStat = attacker.stats.find(s => s.stat.name === attackStatName)!.base_stat * getStageMultiplier(attacker.statStages[attackStatName]);
  const defenseStat = defender.stats.find(s => s.stat.name === defenseStatName)!.base_stat * getStageMultiplier(defender.statStages[defenseStatName]);
  let baseDamage = Math.floor(((((2 * LEVEL / 5) + 2) * move.power! * (attackStat / defenseStat)) / 50) + 2);
  if (isCrit(attacker)) { baseDamage *= 1.5; messages.push("Um golpe crítico!"); }
  if (attacker.types.includes(move.type)) { baseDamage *= 1.5; }
  let effectiveness = 1;
  if (defender.abilities.some(a => a.name === 'levitate') && move.type === 'ground') {
    effectiveness = 0;
    messages.push(`Não afeta o ${defender.name} por causa da sua habilidade Levitate...`);
  } else if (move.typeRelations) {
    defender.types.forEach(defType => {
      if (move.typeRelations!.double_damage_to.some(t => t.name === defType)) effectiveness *= 2;
      if (move.typeRelations!.half_damage_to.some(t => t.name === defType)) effectiveness *= 0.5;
      if (move.typeRelations!.no_damage_to.some(t => t.name === defType)) effectiveness *= 0;
    });
  }
  if (effectiveness > 1) messages.push("É super efetivo!");
  if (effectiveness < 1 && effectiveness > 0) messages.push("Não é muito efetivo...");
  if (effectiveness === 0 && messages.length === 0) messages.push("Não teve efeito!");
  return { damage: Math.floor(baseDamage * effectiveness), messages };
};
const isCrit = (attacker: Pokemon) => Math.random() < 1 / 16;
const HealthBar = ({ currentHp, maxHp, status, statStages }: { currentHp: number, maxHp: number, status: string | null, statStages: { [key: string]: number } }) => {
  const healthPercentage = (currentHp / maxHp) * 100;
  const barColor = healthPercentage > 50 ? '#4CAF50' : healthPercentage > 20 ? '#FFC107' : '#F44336';
  const statChanges = Object.entries(statStages).filter(([_, val]) => val !== 0);
  return (
    <View>
      <View style={styles.healthBarContainer}>
        <View style={[styles.healthBar, { width: `${healthPercentage}%`, backgroundColor: barColor }]} />
        <Text style={styles.hpText}>{`${Math.max(0, currentHp)} / ${maxHp}`}</Text>
      </View>
      <View style={styles.statusContainer}>
        {status && <Text style={[styles.statusBadge, {backgroundColor: '#a1921a'}]}>{status.toUpperCase()}</Text>}
        {statChanges.map(([stat, val]) => (
          <Text key={stat} style={[styles.statusBadge, {backgroundColor: val > 0 ? '#2e6bd9' : '#c94d4d'}]}>
            {stat.slice(0,3).toUpperCase()} {val > 0 ? `↑${val}` : `↓${Math.abs(val)}`}
          </Text>
        ))}
      </View>
    </View>
  );
};
const TeamIcon = ({ pokemon, isActive }: { pokemon: Pokemon, isActive: boolean }) => (
  <View style={[styles.teamIcon, isActive && styles.activeTeamIcon, pokemon.isFainted && styles.faintedIcon]}>
    <Image source={{ uri: pokemon.sprites.front_default }} style={styles.teamIconSprite} />
  </View>
);
export default function BattleScreen() {
  const [playerTeam, setPlayerTeam] = useState<Pokemon[]>([]);
  const [opponentTeam, setOpponentTeam] = useState<Pokemon[]>([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [activeOpponentIndex, setActiveOpponentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('loading');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const battleMusicRef = useRef<Audio.Sound | null>(null);
  const victoryMusicRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const activePlayerPokemon = playerTeam[activePlayerIndex];
  const activeOpponentPokemon = opponentTeam[activeOpponentIndex];
  const addToLog = (message: string) => setBattleLog(prev => [message, ...prev]);
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadSounds = async () => {
        try {
          const { sound: victorySound } = await Audio.Sound.createAsync(VICTORY_MUSIC_FILE, { isLooping: false });
          if (isMounted) { victoryMusicRef.current = victorySound; setupBattle(true); }
        } catch (e) { console.error("Não foi possível carregar os sons", e); }
      };
      loadSounds();
      return () => {
        isMounted = false;
        battleMusicRef.current?.unloadAsync();
        victoryMusicRef.current?.unloadAsync();
      };
    }, [])
  );
  const setupBattle = useCallback(async (isInitialSetup = false) => {
    setGameState('loading');
    setBattleLog([]);
    setShowSwitchMenu(false);
    await victoryMusicRef.current?.stopAsync();
    await battleMusicRef.current?.unloadAsync();
    try {
      const randomMusicFile = BATTLE_MUSIC_FILES[Math.floor(Math.random() * BATTLE_MUSIC_FILES.length)];
      const { sound: newBattleMusic } = await Audio.Sound.createAsync(randomMusicFile, { isLooping: true });
      battleMusicRef.current = newBattleMusic;
      await battleMusicRef.current.playAsync();
      if (isInitialSetup) {
        const randomIds = new Set<number>();
        while (randomIds.size < 12) { randomIds.add(Math.floor(Math.random() * TOTAL_POKEMON) + 1); }
        const pokemonData = await Promise.all(Array.from(randomIds).map(id => fetchPokemonData(id)));
        setPlayerTeam(pokemonData.slice(0, 6));
        setOpponentTeam(pokemonData.slice(6, 12));
      } else {
        const resetTeam = (team: Pokemon[]) => team.map(p => ({...p, currentHp: p.maxHp, isFainted: false, statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 }, statusCondition: null, moves: p.moves.map(m => ({...m, pp: m.maxPp}))}));
        setPlayerTeam(prev => resetTeam(prev));
        setOpponentTeam(prev => resetTeam(prev));
      }
      setActivePlayerIndex(0);
      setActiveOpponentIndex(0);
      addToLog(`Uma batalha aleatória 6v6 começou!`);
      setGameState('player_turn');
    } catch (error) { console.error("Erro ao preparar a batalha:", error); }
  }, []);
  const applyAbility = (pokemon: Pokemon, target: Pokemon, isEntering: boolean) => {
    pokemon.abilities.forEach(ability => {
      if (ability.name === 'intimidate' && isEntering) {
        addToLog(`${pokemon.name} usou Intimidate!`);
        addToLog(`O ataque de ${target.name} diminuiu!`);
        target.statStages.attack = Math.max(-6, target.statStages.attack - 1);
      }
    });
  };
  const applyEndOfTurnEffects = (pokemon: Pokemon, teamSetter: React.Dispatch<React.SetStateAction<Pokemon[]>>, teamIndex: number) => {
    let hpLoss = 0;
    if (pokemon.statusCondition === 'poison') {
      hpLoss = Math.floor(pokemon.maxHp / 8);
      pokemon.currentHp -= hpLoss;
      addToLog(`${pokemon.name} foi ferido pelo veneno!`);
    }
    if (pokemon.currentHp <= 0) {
      pokemon.isFainted = true;
      addToLog(`${pokemon.name} desmaiou!`);
    }
    teamSetter(prev => {
      const newTeam = [...prev];
      newTeam[teamIndex] = pokemon;
      return newTeam;
    });
    return pokemon.isFainted;
  };
  const executeAttack = (attacker: Pokemon, defender: Pokemon, move: Move | null) => {
    if (!move) {
      return false;
    }if (attacker.isFainted) return false;
    if (attacker.statusCondition === 'paralysis' && Math.random() < 0.25) {
      addToLog(`${attacker.name} está paralisado! Não consegue mover-se!`);
      return false;
    } 
    const moveIndex = attacker.moves.findIndex(m => m.name === move.name);
    if (moveIndex !== -1) attacker.moves[moveIndex].pp--;
    if (move.damage_class === 'status') {
      addToLog(`${attacker.name} usou ${move.name}!`);
      move.stat_changes.forEach(change => {
        const target = change.change > 0 ? attacker : defender;
        const statName = change.stat.name as StatName;
        const oldStage = target.statStages[statName];
        target.statStages[statName] = Math.max(-6, Math.min(6, oldStage + change.change));
        if (target.statStages[statName] !== oldStage) {
          addToLog(`O ${statName} de ${target.name} ${change.change > 0 ? 'aumentou' : 'diminuiu'}!`);
        }
      });
    } else {
      const { damage, messages } = calculateDamage(attacker, defender, move);
      addToLog(`${attacker.name} usou ${move.name}!`);
      messages.forEach(msg => addToLog(msg));
      defender.currentHp = Math.max(0, defender.currentHp - damage);
    }
    if (move.meta && move.meta.ailment.name !== 'none' && Math.random() < move.meta.ailment_chance / 100) {
      if (!defender.statusCondition) {
        defender.statusCondition = move.meta.ailment.name;
        addToLog(`${defender.name} foi afetado por ${move.meta.ailment.name}!`);
      }
    }
    if (defender.currentHp <= 0) {
      defender.isFainted = true;
      addToLog(`${defender.name} desmaiou!`);
      return true;
    }
    return false;
  };
  const handleTurn = (playerMove: Move | null) => {
    const player = activePlayerPokemon;
    const opponent = activeOpponentPokemon;
    const opponentMove = opponent.moves[Math.floor(Math.random() * opponent.moves.length)];
    const playerSpeed = player.stats.find(s => s.stat.name === 'speed')!.base_stat * getStageMultiplier(player.statStages.speed);
    const opponentSpeed = opponent.stats.find(s => s.stat.name === 'speed')!.base_stat * getStageMultiplier(opponent.statStages.speed);
    const firstAttacker = playerSpeed >= opponentSpeed ? player : opponent;
    const secondAttacker = playerSpeed < opponentSpeed ? player : opponent;
    const firstMove = firstAttacker === player ? playerMove : opponentMove;
    const secondMove = secondAttacker === player ? playerMove : opponentMove;
    let defenderFainted = executeAttack(firstAttacker, secondAttacker, firstMove);
    if (!defenderFainted) {
      defenderFainted = executeAttack(secondAttacker, firstAttacker, secondMove);
    }
    let playerFainted = false;
    let opponentFainted = false;
    if (!player.isFainted && !defenderFainted) playerFainted = applyEndOfTurnEffects(player, setPlayerTeam, activePlayerIndex);
    if (!opponent.isFainted && !defenderFainted) opponentFainted = applyEndOfTurnEffects(opponent, setOpponentTeam, activeOpponentIndex);
    setPlayerTeam([...playerTeam]);
    setOpponentTeam([...opponentTeam]);
    setTimeout(() => {
      if (playerTeam.every(p => p.isFainted)) {
        addToLog("Você perdeu a batalha!");
        setGameState('finished');
        battleMusicRef.current?.stopAsync();
      } else if (opponentTeam.every(p => p.isFainted)) {
        addToLog("Você venceu a batalha!");
        setGameState('finished');
        battleMusicRef.current?.stopAsync();
        victoryMusicRef.current?.replayAsync();
      } else if (player.isFainted || playerFainted) {
        setGameState('awaiting_switch');
        setShowSwitchMenu(true);
        addToLog("Escolha o seu próximo Pokémon!");
      } else if (opponent.isFainted || opponentFainted) {
        const nextOpponentIndex = opponentTeam.findIndex(p => !p.isFainted);
        if (nextOpponentIndex !== -1) {
          addToLog(`O oponente enviou ${opponentTeam[nextOpponentIndex].name}!`);
          setActiveOpponentIndex(nextOpponentIndex);
          applyAbility(opponentTeam[nextOpponentIndex], player, true);
          setGameState('player_turn');
        }
      } else {
        setGameState('player_turn');
      }
    }, 1000);
  };
  const onPlayerMove = (move: Move) => {
    if (gameState !== 'player_turn' || move.pp === 0) return;
    setGameState('opponent_turn');
    handleTurn(move);
  };
  const handleSwitch = (index: number) => {
    if (playerTeam[index].isFainted || index === activePlayerIndex) return;
    const oldPokemonName = activePlayerPokemon.name;
    setActivePlayerIndex(index);
    setShowSwitchMenu(false);
    const newPokemon = playerTeam[index];
    if (gameState === 'awaiting_switch') {
        addToLog(`Vai, ${newPokemon.name}!`);
        applyAbility(newPokemon, activeOpponentPokemon, true);
        setGameState('player_turn');
    } else {
        addToLog(`${oldPokemonName}, volte! Vai, ${newPokemon.name}!`);
        applyAbility(newPokemon, activeOpponentPokemon, true);
        setGameState('opponent_turn');
        setTimeout(() => handleTurn(null), 1500);
    }
  };
  if (gameState === 'loading' || !activePlayerPokemon || !activeOpponentPokemon) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  const renderActionPanel = () => {
    if (gameState === 'finished') {
        return <TouchableOpacity style={styles.actionButton} onPress={() => setupBattle(false)}><Text style={styles.actionText}>Jogar Novamente</Text></TouchableOpacity>;
    }
    if (showSwitchMenu) {
        return (
            <>
                {playerTeam.map((pokemon, index) => (
                    <TouchableOpacity key={index} style={[styles.switchCard, (pokemon.isFainted || index === activePlayerIndex) && styles.disabledButton]} onPress={() => handleSwitch(index)} disabled={pokemon.isFainted || index === activePlayerIndex}>
                        <Image source={{ uri: pokemon.sprites.front_default }} style={styles.switchSprite} />
                        <View style={styles.switchInfo}>
                            <Text style={styles.switchName}>{pokemon.name}</Text>
                            <Text style={styles.switchHp}>{pokemon.currentHp}/{pokemon.maxHp} HP</Text>
                        </View>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.actionButton, styles.backButton]} onPress={() => setShowSwitchMenu(false)}>
                    <Text style={styles.actionText}>Voltar</Text>
                </TouchableOpacity>
            </>
        );
    }
    return (
        <>
            {activePlayerPokemon.moves.map(move => (
                <TouchableOpacity key={move.name} style={[styles.actionButton, {backgroundColor: TYPE_COLORS[move.type] || '#A8A77A'}, move.pp === 0 && styles.disabledButton]} onPress={() => onPlayerMove(move)} disabled={gameState !== 'player_turn' || move.pp === 0}>
                    <Text style={styles.actionText}>{move.name}</Text>
                    <Text style={styles.ppText}>PP {move.pp}/{move.maxPp}</Text>
                </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.actionButton} onPress={() => setShowSwitchMenu(true)} disabled={gameState !== 'player_turn'}>
                <Text style={styles.actionText}>Trocar Pokémon</Text>
            </TouchableOpacity>
        </>
    );
  };
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.battleArea}>
        <View style={styles.teamContainer}>
            {opponentTeam.map((p, i) => <TeamIcon key={p.id} pokemon={p} isActive={i === activeOpponentIndex} />)}
        </View>
        <View style={styles.pokemonContainer}>
            <View style={styles.infoBox}>
                <View style={styles.nameRow}>
                    <Text style={styles.nameText}>{activeOpponentPokemon.name}</Text>
                    {activeOpponentPokemon.types.map(t => <View key={t} style={[styles.typeBadge, {backgroundColor: TYPE_COLORS[t]}]}><Text style={styles.typeText}>{t.toUpperCase()}</Text></View>)}
                </View>
                <HealthBar currentHp={activeOpponentPokemon.currentHp} maxHp={activeOpponentPokemon.maxHp} status={activeOpponentPokemon.statusCondition} statStages={activeOpponentPokemon.statStages} />
            </View>
            <Image source={{ uri: activeOpponentPokemon.sprites.front_default }} style={styles.sprite} />
        </View>
        <View style={styles.pokemonContainer}>
            <Image source={{ uri: activePlayerPokemon.sprites.back_default }} style={styles.sprite} />
             <View style={styles.infoBox}>
                <View style={styles.nameRow}>
                    <Text style={styles.nameText}>{activePlayerPokemon.name}</Text>
                    {activePlayerPokemon.types.map(t => <View key={t} style={[styles.typeBadge, {backgroundColor: TYPE_COLORS[t]}]}><Text style={styles.typeText}>{t.toUpperCase()}</Text></View>)}
                </View>
                <HealthBar currentHp={activePlayerPokemon.currentHp} maxHp={activePlayerPokemon.maxHp} status={activePlayerPokemon.statusCondition} statStages={activePlayerPokemon.statStages} />
            </View>
        </View>
        <View style={styles.teamContainer}>
            {playerTeam.map((p, i) => <TeamIcon key={p.id} pokemon={p} isActive={i === activePlayerIndex} />)}
        </View>
      </View>
      <View style={styles.controlsContainer}>
        <View style={styles.logContainer}>
            <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({animated: true})}>
                {battleLog.slice(0, 10).map((msg, index) => <Text key={index} style={styles.logText}>{msg}</Text>)}
            </ScrollView>
        </View>
        <View style={styles.actionsPanel}>
            {renderActionPanel()}
        </View>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1e1e1e' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1e1e' },
    battleArea: { flex: 3, justifyContent: 'space-between', paddingVertical: 10 },
    pokemonContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
    infoBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, marginHorizontal: 10 },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
    nameText: { fontSize: 18, fontWeight: 'bold', color: 'white', marginRight: 8 },
    typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginRight: 5 },
    typeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    healthBarContainer: { height: 15, backgroundColor: '#555', borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
    healthBar: { height: '100%', borderRadius: 10 },
    hpText: { position: 'absolute', alignSelf: 'center', color: 'white', fontWeight: 'bold', fontSize: 10 },
    statusContainer: { flexDirection: 'row', marginTop: 4 },
    statusBadge: { color: 'white', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 5, borderRadius: 3, marginRight: 4 },
    sprite: { width: 140, height: 140, resizeMode: 'contain' },
    teamContainer: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 10 },
    teamIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#555', marginHorizontal: 2, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
    activeTeamIcon: { borderColor: '#FFCB05' },
    faintedIcon: { opacity: 0.4 },
    teamIconSprite: { width: 40, height: 40 },
    controlsContainer: { flex: 2, borderTopWidth: 4, borderColor: '#000', flexDirection: 'row' },
    logContainer: { flex: 1.2, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10 },
    logText: { color: 'white', fontSize: 14, marginBottom: 5, fontStyle: 'italic' },
    actionsPanel: { flex: 1, padding: 5, justifyContent: 'center', flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center' },
    actionButton: { borderRadius: 10, padding: 5, margin: 4, width: '45%', minHeight: 50, alignItems: 'center', justifyContent: 'center' },
    disabledButton: { backgroundColor: '#333', opacity: 0.6 },
    actionText: { color: 'white', fontWeight: 'bold', textTransform: 'capitalize', textAlign: 'center' },
    ppText: { color: '#ddd', fontSize: 10 },
    switchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4a4a4a', borderRadius: 10, padding: 5, margin: 4, width: '45%' },
    switchSprite: { width: 40, height: 40 },
    switchInfo: { marginLeft: 10, flex: 1 },
    switchName: { color: 'white', fontWeight: 'bold' },
    switchHp: { color: '#ccc', fontSize: 12 },
    backButton: { backgroundColor: '#757575' },
});