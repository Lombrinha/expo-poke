import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, SafeAreaView, TouchableOpacity, ScrollView, ImageBackground, Modal, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
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
const BATTLE_BACKGROUND_IMAGE = require('../assets/battle_bg.png');
const POKEBALL_ICON = require('../assets/R.png');
const fetchPokemonData = async (id: number): Promise<Pokemon> => {
  const pokemonRes = await fetch(`${POKEMON_API_BASE_URL}pokemon/${id}`);
  const pokemonData = await pokemonRes.json();
  const animatedSprites = pokemonData.sprites.versions['generation-v']['black-white'].animated;
  const sprites = {
      front_default: animatedSprites.front_default || pokemonData.sprites.front_default,
      back_default: animatedSprites.back_default || pokemonData.sprites.back_default,
  };
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
    sprites: sprites, stats: pokemonData.stats, types: pokemonData.types.map((t: any) => t.type.name),
    abilities: abilities, moves: movesWithDetails, currentHp: maxHp, maxHp: maxHp, isFainted: false,
    statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 },
    statusCondition: null, statusCounter: 0,
  };
};
const getStageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

const calculateDamage = (attacker: Pokemon, defender: Pokemon, move: Move, addToLog: (msg: string) => void) => {
  const absorbAbilities = { 'volt-absorb': 'electric', 'water-absorb': 'water', 'flash-fire': 'fire' };
  for (const [ability, type] of Object.entries(absorbAbilities)) {
      if (defender.abilities.some(a => a.name === ability) && move.type === type) {
          const healedAmount = Math.floor(defender.maxHp / 4);
          defender.currentHp = Math.min(defender.maxHp, defender.currentHp + healedAmount);
          addToLog(`${defender.name} absorveu o ataque com ${ability} e recuperou vida!`);
          return { damage: 0, messages: [] };
      }
  }
  let messages: string[] = [];
  const attackStatName = move.damage_class === 'physical' ? 'attack' : 'special-attack';
  const defenseStatName = move.damage_class === 'physical' ? 'defense' : 'special-defense';
  const attackStat = attacker.stats.find(s => s.stat.name === attackStatName)!.base_stat * getStageMultiplier(attacker.statStages[attackStatName]);
  const defenseStat = defender.stats.find(s => s.stat.name === defenseStatName)!.base_stat * getStageMultiplier(defender.statStages[defenseStatName]);
  let baseDamage = Math.floor(((((2 * LEVEL / 5) + 2) * move.power! * (attackStat / defenseStat)) / 50) + 2);
  if (Math.random() < 1 / 16) { baseDamage *= 1.5; messages.push("Um golpe crítico!"); }
  if (attacker.types.includes(move.type)) { baseDamage *= 1.5; }
  let effectiveness = 1;
  if (defender.abilities.some(a => a.name === 'levitate') && move.type === 'ground') {
    effectiveness = 0;
    messages.push(`Não afeta ${defender.name} por causa da sua habilidade Levitate...`);
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
const HealthBar = ({ percentage }: { percentage: number }) => {
    const barColor = percentage > 50 ? '#00FF00' : percentage > 20 ? '#FFFF00' : '#FF0000';
    return (
        <View style={styles.healthBarOuter}>
            <View style={[styles.healthBarInner, { width: `${percentage}%`, backgroundColor: barColor }]} />
        </View>
    );
};
const InfoBox = ({ pokemon }: { pokemon: Pokemon }) => {
    const hpPercentage = (pokemon.currentHp / pokemon.maxHp) * 100;
    return (
        <View style={styles.infoBox}>
            <View style={styles.infoBoxTop}>
                <Text style={styles.infoBoxName}>{pokemon.name}</Text>
                <Text style={styles.infoBoxLevel}>Lv{LEVEL}</Text>
                {pokemon.statusCondition && <Text style={styles.infoBoxStatus}>{pokemon.statusCondition.toUpperCase()}</Text>}
            </View>
            <View style={styles.infoBoxBottom}>
                <Text style={styles.hpLabel}>HP:</Text>
                <HealthBar percentage={hpPercentage} />
                <Text style={styles.hpPercentage}>{Math.round(hpPercentage)}%</Text>
            </View>
             <Text style={styles.hpNumbers}>{Math.max(0, pokemon.currentHp)} / {pokemon.maxHp}</Text>
        </View>
    );
};
const TeamStatus = ({ team }: { team: Pokemon[] }) => (
    <View style={styles.teamStatusContainer}>
        {team.map((p, i) => (
            <Image key={i} source={POKEBALL_ICON} style={[styles.pokeballIcon, p.isFainted && styles.faintedPokeball]} />
        ))}
    </View>
);
const SwitchPokemonButton = ({ pokemon, onPress, isActive, isFainted }: { pokemon: Pokemon, onPress: () => void, isActive: boolean, isFainted: boolean }) => {
    const hpPercentage = (pokemon.currentHp / pokemon.maxHp) * 100;
    const barColor = hpPercentage > 50 ? '#00FF00' : hpPercentage > 20 ? '#FFFF00' : '#FF0000';
    const buttonStyle = [
        styles.switchPokemonButton,
        isFainted ? styles.faintedSwitchButton : null,
        isActive ? styles.activeSwitchButton : null,
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
const PokemonEffectsIndicator = ({ pokemon }: { pokemon: Pokemon }) => {
    const statChanges = Object.entries(pokemon.statStages)
        .filter(([_, value]) => value !== 0)
        .map(([stat, value]) => ({ stat: stat.replace('special-', 'sp ').replace('-', ' '), value }));
    return (
        <View style={styles.effectsIndicatorContainer}>
            {pokemon.statusCondition && (
                <View style={[styles.effectBadge, { backgroundColor: STATUS_COLORS[pokemon.statusCondition] || '#777' }]}>
                    <Text style={styles.effectBadgeText}>{pokemon.statusCondition.slice(0, 3).toUpperCase()}</Text>
                </View>
            )}
            {statChanges.map(({ stat, value }) => (
                <View key={stat} style={[styles.effectBadge, { backgroundColor: value > 0 ? '#4CAF50' : '#F44336' }]}>
                    <Text style={styles.effectBadgeText}>
                        {stat.slice(0, 3).toUpperCase()} {value > 0 ? '↑' : '↓'}
                    </Text>
                </View>
            ))}
        </View>
    );
};
const PokemonDetailsModal = ({ pokemon, visible, onClose, isOpponent, revealedMoves }: { pokemon: Pokemon | null, visible: boolean, onClose: () => void, isOpponent: boolean, revealedMoves: string[] }) => {
    if (!visible || !pokemon) return null;
    const movesToShow = isOpponent ? revealedMoves.map(moveName => pokemon.moves.find(m => m.name === moveName)).filter(Boolean) as Move[] : pokemon.moves;
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
                        <Text style={styles.detailTitle}>Habilidades:</Text>
                        {pokemon.abilities.map(ability => (
                            <Text key={ability.name} style={styles.detailText}>{ability.name.replace('-', ' ')}</Text>
                        ))}
                    </View>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailTitle}>Movimentos:</Text>
                        {movesToShow.map(move => (
                            <Text key={move.name} style={styles.detailText}>{move.name}</Text>
                        ))}
                        {isOpponent && movesToShow.length === 0 && <Text style={styles.detailText}>Nenhum movimento revelado ainda.</Text>}
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};
export default function BattleScreen() {
  const [playerTeam, setPlayerTeam] = useState<Pokemon[]>([]);
  const [opponentTeam, setOpponentTeam] = useState<Pokemon[]>([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [activeOpponentIndex, setActiveOpponentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('loading');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [pokemonInModal, setPokemonInModal] = useState<Pokemon | null>(null);
  const [isModalForOpponent, setIsModalForOpponent] = useState(false);
  const [revealedOpponentMoves, setRevealedOpponentMoves] = useState<string[]>([]);
  const battleMusicRef = useRef<Audio.Sound | null>(null);
  const victoryMusicRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const activePlayerPokemon = playerTeam[activePlayerIndex];
  const activeOpponentPokemon = opponentTeam[activeOpponentIndex];
  const addToLog = (message: string) => setBattleLog(prev => [...prev, message]);
  const showPokemonDetails = (pokemon: Pokemon, isOpponent: boolean) => {
      setPokemonInModal(pokemon);
      setIsModalForOpponent(isOpponent);
      setDetailsModalVisible(true);
  };
  const hidePokemonDetails = () => {
      setPokemonInModal(null);
      setDetailsModalVisible(false);
  };
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadSounds = async () => {
        try {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          const { sound: victorySound } = await Audio.Sound.createAsync(VICTORY_MUSIC_FILE, { isLooping: false });
          if (isMounted) { victoryMusicRef.current = victorySound; setupBattle(true); }
        } catch (e) { console.error("Falha ao carregar os sons", e); }
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
    setRevealedOpponentMoves([]);
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
        const resetTeam = (team: Pokemon[]) => team.map(p => ({...p, currentHp: p.maxHp, isFainted: false, statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 }, statusCondition: null, statusCounter: 0, moves: p.moves.map(m => ({...m, pp: m.maxPp}))}));
        setPlayerTeam(prev => resetTeam(prev));
        setOpponentTeam(prev => resetTeam(prev));
      }
      setActivePlayerIndex(0);
      setActiveOpponentIndex(0);
      addToLog(`Uma batalha aleatória 6v6 começou!`);
      setGameState('player_turn');
    } catch (error) { console.error("Erro ao preparar a batalha:", error); }
  }, []);
  const applyAbilityOnEntry = (pokemon: Pokemon, target: Pokemon) => {
    pokemon.abilities.forEach(ability => {
      if (ability.name === 'intimidate') {
        addToLog(`${pokemon.name} usou Intimidate!`);
        if(target.statStages.attack > -6) {
            target.statStages.attack--;
            addToLog(`O ataque de ${target.name} diminuiu!`);
        } else {
            addToLog(`O ataque de ${target.name} não pode diminuir mais!`);
        }
      }
    });
  };
  const applyEndOfTurnEffects = (pokemon: Pokemon) => {
    if (pokemon.statusCondition === 'poison' || pokemon.statusCondition === 'burn') {
      const damage = Math.floor(pokemon.maxHp / 8);
      pokemon.currentHp -= damage;
      addToLog(`${pokemon.name} foi ferido por ${pokemon.statusCondition}!`);
    }
    if (pokemon.currentHp <= 0) {
      pokemon.isFainted = true;
      addToLog(`${pokemon.name} desmaiou!`);
    }
    return pokemon.isFainted;
  };
  const handleContactAbility = (attacker: Pokemon, defender: Pokemon) => {
      if(defender.abilities.some(a => a.name === 'static') && Math.random() < 0.3) {
          if(!attacker.statusCondition) {
              attacker.statusCondition = 'paralysis';
              addToLog(`${defender.name}'s Static paralisou ${attacker.name}!`);
          }
      }
      if(defender.abilities.some(a => a.name === 'poison-point') && Math.random() < 0.3) {
          if(!attacker.statusCondition) {
              attacker.statusCondition = 'poison';
              addToLog(`${defender.name}'s Poison Point envenenou ${attacker.name}!`);
          }
      }
  }
  const executeAttack = (attacker: Pokemon, defender: Pokemon, move: Move | null, isOpponent: boolean) => {
    if (!move || attacker.isFainted) return false;
    if (isOpponent && !revealedOpponentMoves.includes(move.name)) {
        setRevealedOpponentMoves(prev => [...new Set([...prev, move.name])]);
    }
    if (attacker.statusCondition === 'sleep') {
        attacker.statusCounter--;
        if (attacker.statusCounter <= 0) {
            attacker.statusCondition = null;
            addToLog(`${attacker.name} acordou!`);
        } else {
            addToLog(`${attacker.name} está dormindo profundamente.`);
            return false;
        }
    }
    if (attacker.statusCondition === 'paralysis' && Math.random() < 0.25) {
      addToLog(`${attacker.name} está paralisado! Não consegue se mover!`);
      return false;
    }
    const moveIndex = attacker.moves.findIndex(m => m.name === move.name);
    if (moveIndex !== -1) attacker.moves[moveIndex].pp--;
    addToLog(`${attacker.name} usou ${move.name}!`);
    if (move.name.toLowerCase() === 'rest') {
        attacker.currentHp = attacker.maxHp;
        attacker.statusCondition = 'sleep';
        attacker.statusCounter = 2;
        attacker.statStages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 };
        addToLog(`${attacker.name} foi dormir e recuperou toda a vida!`);
        return false;
    }
    if (move.damage_class === 'status') {
      if (move.meta.healing > 0) {
          const healAmount = Math.floor(attacker.maxHp * (move.meta.healing / 100));
          attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
          addToLog(`${attacker.name} recuperou vida!`);
      }
      move.stat_changes.forEach(change => {
        const target = change.change > 0 ? attacker : defender;
        const statName = change.stat.name as StatName;
        const currentStage = target.statStages[statName];
        if((change.change > 0 && currentStage < 6) || (change.change < 0 && currentStage > -6)) {
            target.statStages[statName] = Math.max(-6, Math.min(6, currentStage + change.change));
            addToLog(`O ${statName} de ${target.name} ${change.change > 0 ? 'aumentou' : 'diminuiu'}!`);
        } else {
            addToLog(`O ${statName} de ${target.name} não pode ir mais ${change.change > 0 ? 'alto' : 'baixo'}!`);
        }
      });
    } else {
      const { damage, messages } = calculateDamage(attacker, defender, move, addToLog);
      messages.forEach(msg => addToLog(msg));
      if (damage > 0) {
        defender.currentHp = Math.max(0, defender.currentHp - damage);
        if (move.damage_class === 'physical') {
            handleContactAbility(attacker, defender);
        }
      }
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
    setGameState('opponent_turn');
    const player = { ...activePlayerPokemon };
    const opponent = { ...activeOpponentPokemon };
    const opponentMove = opponent.moves.find(m => m.pp > 0 && (m.power || m.damage_class === 'status')) || opponent.moves[0];
    const playerSpeed = player.stats.find(s => s.stat.name === 'speed')!.base_stat * getStageMultiplier(player.statStages.speed);
    const opponentSpeed = opponent.stats.find(s => s.stat.name === 'speed')!.base_stat * getStageMultiplier(opponent.statStages.speed);
    const firstAttacker = playerSpeed >= opponentSpeed ? player : opponent;
    const secondAttacker = playerSpeed < opponentSpeed ? player : opponent;
    const firstMove = firstAttacker === player ? playerMove : opponentMove;
    const secondMove = secondAttacker === player ? playerMove : opponentMove;
    let defenderFainted = executeAttack(firstAttacker, secondAttacker, firstMove, firstAttacker === opponent);
    if (!defenderFainted && !secondAttacker.isFainted) {
      defenderFainted = executeAttack(secondAttacker, firstAttacker, secondMove, secondAttacker === opponent);
    }
    let playerFaintedByStatus = false;
    let opponentFaintedByStatus = false;
    if (!player.isFainted) playerFaintedByStatus = applyEndOfTurnEffects(player);
    if (!opponent.isFainted) opponentFaintedByStatus = applyEndOfTurnEffects(opponent);
    const finalPlayerFainted = player.isFainted || playerFaintedByStatus;
    const finalOpponentFainted = opponent.isFainted || opponentFaintedByStatus;
    setPlayerTeam(prev => prev.map(p => p.id === player.id ? player : p));
    setOpponentTeam(prev => prev.map(p => p.id === opponent.id ? opponent : p));
    setTimeout(() => {
      const updatedPlayerTeam = playerTeam.map(p => p.id === player.id ? player : p);
      const updatedOpponentTeam = opponentTeam.map(p => p.id === opponent.id ? opponent : p);
      if (updatedPlayerTeam.every(p => p.isFainted)) {
        addToLog("Você perdeu a batalha!");
        setGameState('finished');
        battleMusicRef.current?.stopAsync();
      } else if (updatedOpponentTeam.every(p => p.isFainted)) {
        addToLog("Você venceu a batalha!");
        setGameState('finished');
        battleMusicRef.current?.stopAsync();
        victoryMusicRef.current?.replayAsync();
      } else if (finalPlayerFainted) {
        setGameState('awaiting_switch');
        addToLog("Seu Pokémon desmaiou! Escolha o seu próximo Pokémon.");
      } else if (finalOpponentFainted) {
        const nextOpponentIndex = updatedOpponentTeam.findIndex(p => !p.isFainted);
        if (nextOpponentIndex !== -1) {
          addToLog(`O oponente enviou ${updatedOpponentTeam[nextOpponentIndex].name}!`);
          setActiveOpponentIndex(nextOpponentIndex);
          applyAbilityOnEntry(updatedOpponentTeam[nextOpponentIndex], player);
          setGameState('player_turn');
        }
      } else {
        setGameState('player_turn');
      }
    }, 1500);
  };
  const onPlayerMove = (move: Move) => {
    if (gameState !== 'player_turn' || move.pp === 0) return;
    handleTurn(move);
  };
  const handleSwitch = (index: number) => {
    if (playerTeam[index].isFainted || index === activePlayerIndex || (gameState !== 'player_turn' && gameState !== 'awaiting_switch')) return;
    const oldPokemonName = activePlayerPokemon.name;
    const newPokemon = playerTeam[index];
    if (gameState === 'awaiting_switch') {
        setActivePlayerIndex(index);
        addToLog(`Vai, ${newPokemon.name}!`);
        applyAbilityOnEntry(newPokemon, activeOpponentPokemon);
        setGameState('player_turn');
    } else if (gameState === 'player_turn') {
        setActivePlayerIndex(index);
        addToLog(`${oldPokemonName}, volte! Vai, ${newPokemon.name}!`);
        applyAbilityOnEntry(newPokemon, activeOpponentPokemon);
        handleTurn(null);
    }
  };
  if (gameState === 'loading' || !activePlayerPokemon || !activeOpponentPokemon) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  const renderActionPanel = () => {
    if (gameState === 'finished') {
        return <TouchableOpacity style={styles.playAgainButton} onPress={() => setupBattle(false)}><Text style={styles.actionText}>Jogar Novamente</Text></TouchableOpacity>;
    }
    const isSwitchForced = gameState === 'awaiting_switch';
    return (
        <View style={styles.actionPanelContainer}>
            <View>
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switchPanel}>
                    {playerTeam.map((pokemon, index) => (
                        <SwitchPokemonButton
                            key={index}
                            pokemon={pokemon}
                            onPress={() => handleSwitch(index)}
                            isActive={index === activePlayerIndex}
                            isFainted={pokemon.isFainted}
                        />
                    ))}
                </ScrollView>
            </View>
            <View style={[styles.movePanel, isSwitchForced && styles.disabledPanel]}>
                 <Text style={styles.whatWillDoText}>O que {activePlayerPokemon.name} fará?</Text>
                <View style={styles.moveGrid}>
                    {activePlayerPokemon.moves.map(move => (
                        <TouchableOpacity key={move.name} style={[styles.actionButton, {backgroundColor: TYPE_COLORS[move.type] || '#A8A77A'}]} onPress={() => onPlayerMove(move)} disabled={isSwitchForced || gameState !== 'player_turn' || move.pp === 0}>
                            <Text style={styles.actionText}>{move.name}</Text>
                            <Text style={styles.ppText}>{move.type}</Text>
                            <Text style={styles.ppText}>PP {move.pp}/{move.maxPp}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );
  };
  const opponentInteractionProps = Platform.OS === 'web'
    ? { onMouseEnter: () => showPokemonDetails(activeOpponentPokemon, true), onMouseLeave: hidePokemonDetails }
    : { onPressIn: () => showPokemonDetails(activeOpponentPokemon, true), onPressOut: hidePokemonDetails };
  const playerInteractionProps = Platform.OS === 'web'
    ? { onMouseEnter: () => showPokemonDetails(activePlayerPokemon, false), onMouseLeave: hidePokemonDetails }
    : { onPressIn: () => showPokemonDetails(activePlayerPokemon, false), onPressOut: hidePokemonDetails };
  return (
    <View style={styles.container}>
        <ImageBackground source={BATTLE_BACKGROUND_IMAGE} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.battleArea}>
                <View style={styles.opponentSide}>
                    <View style={styles.opponentInfoContainer}>
                        <TeamStatus team={opponentTeam} />
                        <InfoBox pokemon={activeOpponentPokemon} />
                    </View>
                    <TouchableOpacity {...opponentInteractionProps}>
                        <Image source={{ uri: activeOpponentPokemon.sprites.front_default }} style={styles.pokemonSprite} />
                        <PokemonEffectsIndicator pokemon={activeOpponentPokemon} />
                    </TouchableOpacity>
                </View>
                <View style={styles.playerSide}>
                    <TouchableOpacity {...playerInteractionProps}>
                        <Image source={{ uri: activePlayerPokemon.sprites.back_default }} style={[styles.pokemonSprite, styles.playerSprite]} />
                        <PokemonEffectsIndicator pokemon={activePlayerPokemon} />
                    </TouchableOpacity>
                    <View style={styles.playerInfoContainer}>
                        <InfoBox pokemon={activePlayerPokemon} />
                        <TeamStatus team={playerTeam} />
                    </View>
                </View>
            </View>
            <View style={styles.controlsContainer}>
                <View style={styles.actionsPanel}>
                    {renderActionPanel()}
                </View>
                <View style={styles.logContainer}>
                    <ScrollView ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
                        {battleLog.map((msg, index) => <Text key={index} style={styles.logText}>{msg}</Text>)}
                    </ScrollView>
                </View>
            </View>
        </SafeAreaView>
        <PokemonDetailsModal pokemon={pokemonInModal} visible={detailsModalVisible} onClose={hidePokemonDetails} isOpponent={isModalForOpponent} revealedMoves={revealedOpponentMoves} />
    </View>
  );
}
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
    infoBox: { backgroundColor: 'rgba(0, 0, 0, 0.6)', borderRadius: 8, padding: 8, marginHorizontal: 10, width: 200 },
    infoBoxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoBoxName: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    infoBoxLevel: { color: 'white', fontSize: 14 },
    infoBoxStatus: { backgroundColor: 'orange', color: 'white', fontWeight: 'bold', paddingHorizontal: 4, borderRadius: 4, fontSize: 10 },
    infoBoxBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    hpLabel: { color: 'yellow', fontWeight: 'bold', fontSize: 12, marginRight: 4 },
    healthBarOuter: { flex: 1, height: 8, backgroundColor: '#555', borderRadius: 4, overflow: 'hidden' },
    healthBarInner: { height: '100%', borderRadius: 4 },
    hpPercentage: { color: 'white', fontSize: 12, marginLeft: 6 },
    hpNumbers: { color: 'white', fontSize: 12, alignSelf: 'flex-end', marginTop: 2 },
    teamStatusContainer: { flexDirection: 'row', marginVertical: 5 },
    pokeballIcon: { width: 20, height: 20, marginHorizontal: 2 },
    faintedPokeball: { opacity: 0.3 },
    controlsContainer: {
        height: 320,
        flexDirection: 'row',
        borderTopWidth: 4,
        borderColor: '#000',
        backgroundColor: 'rgba(51, 51, 51, 0.8)'
    },
    actionsPanel: { flex: 1.5, padding: 4, borderRightWidth: 2, borderColor: '#000' },
    logContainer: { flex: 1, padding: 8 },
    logText: { color: 'white', fontSize: 14, marginBottom: 4 },
    actionPanelContainer: { flex: 1 },
    switchPanel: {
        paddingVertical: 4,
        marginBottom: 4,
    },
    movePanel: {},
    disabledPanel: { opacity: 0.5 },
    whatWillDoText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginBottom: 4, textAlign: 'center' },
    moveGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    actionButton: { width: '48%', borderRadius: 8, padding: 8, marginVertical: 2, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
    actionText: { color: 'white', fontWeight: 'bold', textTransform: 'capitalize', textAlign: 'center', fontSize: 14 },
    ppText: { color: '#ddd', fontSize: 10, textTransform: 'uppercase' },
    playAgainButton: { backgroundColor: '#2196F3', borderRadius: 8, padding: 12, alignItems: 'center' },
    switchPokemonButton: { alignItems: 'center', backgroundColor: '#444', borderRadius: 8, padding: 4, marginHorizontal: 3, width: 90 },
    activeSwitchButton: { borderColor: '#00BFFF', borderWidth: 2 },
    faintedSwitchButton: { backgroundColor: '#555', opacity: 0.6 },
    switchPokemonSprite: { width: 50, height: 50 },
    switchPokemonInfo: { alignItems: 'center', width: '100%' },
    switchPokemonName: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    switchHpBarContainer: { height: 6, width: '80%', backgroundColor: '#222', borderRadius: 3, marginTop: 2 },
    switchHpBar: { height: '100%', borderRadius: 3 },
    effectsIndicatorContainer: {
        position: 'absolute',
        bottom: 10,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    effectBadge: {
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginHorizontal: 2,
    },
    effectBadgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modalContent: {
        backgroundColor: '#2d2d2d',
        borderRadius: 10,
        padding: 20,
        width: '80%',
        borderWidth: 2,
        borderColor: '#555',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 15,
        textAlign: 'center',
    },
    detailSection: {
        marginBottom: 10,
    },
    detailTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFCB05',
        marginBottom: 5,
    },
    detailText: {
        fontSize: 14,
        color: 'white',
        textTransform: 'capitalize',
    },
    typesContainer: {
        flexDirection: 'row',
    },
    typeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 5,
        marginRight: 5,
    },
    typeBadgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
});