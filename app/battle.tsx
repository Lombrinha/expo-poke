import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';

// --- Tipos ---
interface Stat { base_stat: number; stat: { name: string }; }
interface Move { name: string; power: number | null; type: string; }
interface Pokemon {
  id: number;
  name: string;
  sprites: { front_default: string; back_default: string };
  stats: Stat[];
  moves: Move[];
  currentHp: number;
  maxHp: number;
  isFainted: boolean;
}
type GameState = 'loading' | 'player_turn' | 'opponent_turn' | 'awaiting_switch' | 'finished';

const POKEMON_API_BASE_URL = 'https://pokeapi.co/api/v2/';
const TOTAL_POKEMON = 898;
const LEVEL = 50;

const BATTLE_MUSIC_FILES = [
  require('../assets/b1.mp3'),
  require('../assets/b2.mp3'),
  require('../assets/b3.mp3'),
  require('../assets/b4.mp3'),
  require('../assets/b5.mp3'),
];
const VICTORY_MUSIC_FILE = require('../assets/victory.mp3');

// --- Funções de Lógica ---
const fetchPokemonData = async (id: number): Promise<Pokemon> => {
  const pokemonRes = await fetch(`${POKEMON_API_BASE_URL}pokemon/${id}`);
  const pokemonData = await pokemonRes.json();
  const movePromises = pokemonData.moves
    .map((m: any) => fetch(m.move.url).then(res => res.json()))
    .sort(() => 0.5 - Math.random());
  const moveDetails = await Promise.all(movePromises.slice(0, 10));
  const movesWithPower = moveDetails
    .filter(md => md.power !== null && md.power > 0)
    .slice(0, 4)
    .map(md => ({ name: md.name.replace('-', ' '), power: md.power, type: md.type.name }));
  const hpStat = pokemonData.stats.find((s: Stat) => s.stat.name === 'hp').base_stat;
  const maxHp = Math.floor(((2 * hpStat * LEVEL) / 100) + LEVEL + 10);
  return {
    id: pokemonData.id,
    name: pokemonData.name.charAt(0).toUpperCase() + pokemonData.name.slice(1),
    sprites: pokemonData.sprites, stats: pokemonData.stats, moves: movesWithPower,
    currentHp: maxHp, maxHp: maxHp, isFainted: false,
  };
};

const calculateDamage = (attacker: Pokemon, defender: Pokemon, move: Move) => {
  const attackStat = attacker.stats.find(s => s.stat.name === 'attack')!.base_stat;
  const defenseStat = defender.stats.find(s => s.stat.name === 'defense')!.base_stat;
  const damage = Math.floor(((((2 * LEVEL / 5) + 2) * move.power! * (attackStat / defenseStat)) / 50) + 2);
  return Math.max(1, damage);
};

// --- Componentes de UI ---
const HealthBar = ({ currentHp, maxHp }: { currentHp: number; maxHp: number }) => {
  const healthPercentage = (currentHp / maxHp) * 100;
  const barColor = healthPercentage > 50 ? '#4CAF50' : healthPercentage > 20 ? '#FFC107' : '#F44336';
  return (
    <View style={styles.healthBarContainer}>
      <View style={[styles.healthBar, { width: `${healthPercentage}%`, backgroundColor: barColor }]} />
      <Text style={styles.hpText}>{`${Math.max(0, currentHp)} / ${maxHp}`}</Text>
    </View>
  );
};

const TeamIcon = ({ pokemon, isActive }: { pokemon: Pokemon, isActive: boolean }) => (
  <View style={[styles.teamIcon, isActive && styles.activeTeamIcon, pokemon.isFainted && styles.faintedIcon]}>
    <Image source={{ uri: pokemon.sprites.front_default }} style={styles.teamIconSprite} />
  </View>
);

// --- Ecrã Principal da Batalha ---
export default function BattleScreen() {
  const [playerTeam, setPlayerTeam] = useState<Pokemon[]>([]);
  const [opponentTeam, setOpponentTeam] = useState<Pokemon[]>([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [activeOpponentIndex, setActiveOpponentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('loading');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  
  // CORREÇÃO: Usar useRef para uma referência estável aos objetos de som
  const battleMusicRef = useRef<Audio.Sound | null>(null);
  const victoryMusicRef = useRef<Audio.Sound | null>(null);

  const activePlayerPokemon = playerTeam[activePlayerIndex];
  const activeOpponentPokemon = opponentTeam[activeOpponentIndex];

  const addToLog = (message: string) => setBattleLog(prev => [message, ...prev]);

  // Carrega/descarrega músicas quando o ecrã foca/desfoca
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadSounds = async () => {
        try {
          // Carrega o som de vitória
          const { sound: victorySound } = await Audio.Sound.createAsync(VICTORY_MUSIC_FILE, { isLooping: false });
          if (isMounted) {
            victoryMusicRef.current = victorySound;
            // Inicia a primeira batalha assim que os sons estiverem prontos
            setupBattle(true);
          }
        } catch (e) {
          console.error("Não foi possível carregar os sons", e);
        }
      };

      loadSounds();

      return () => { // Função de limpeza executada ao sair do ecrã
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

      if (isInitialSetup) { // Apenas busca os dados na primeira vez
        const randomIds = new Set<number>();
        while (randomIds.size < 12) {
          randomIds.add(Math.floor(Math.random() * TOTAL_POKEMON) + 1);
        }
        const pokemonData = await Promise.all(Array.from(randomIds).map(id => fetchPokemonData(id)));
        setPlayerTeam(pokemonData.slice(0, 6));
        setOpponentTeam(pokemonData.slice(6, 12));
      } else { // Nas vezes seguintes, apenas restaura a vida e o estado
        setPlayerTeam(prev => prev.map(p => ({...p, currentHp: p.maxHp, isFainted: false})));
        setOpponentTeam(prev => prev.map(p => ({...p, currentHp: p.maxHp, isFainted: false})));
      }
      
      setActivePlayerIndex(0);
      setActiveOpponentIndex(0);
      addToLog(`Uma batalha aleatória 6v6 começou!`);
      setGameState('player_turn');
    } catch (error) {
      console.error("Erro ao preparar a batalha:", error);
      addToLog("Não foi possível iniciar a batalha.");
    }
  }, []);

  const handleAttack = (attacker: Pokemon, defender: Pokemon, move: Move, isPlayerAttacking: boolean) => {
    const damage = calculateDamage(attacker, defender, move);
    const newDefenderHp = Math.max(0, defender.currentHp - damage);
    
    if (isPlayerAttacking) {
      const newOpponentTeam = [...opponentTeam];
      newOpponentTeam[activeOpponentIndex].currentHp = newDefenderHp;
      setOpponentTeam(newOpponentTeam);
    } else {
      const newPlayerTeam = [...playerTeam];
      newPlayerTeam[activePlayerIndex].currentHp = newDefenderHp;
      setPlayerTeam(newPlayerTeam);
    }
    
    addToLog(`${attacker.name} usou ${move.name} e causou ${damage} de dano!`);

    if (newDefenderHp <= 0) {
      if (isPlayerAttacking) {
        const newOpponentTeam = [...opponentTeam];
        newOpponentTeam[activeOpponentIndex].isFainted = true;
        setOpponentTeam(newOpponentTeam);
      } else {
        const newPlayerTeam = [...playerTeam];
        newPlayerTeam[activePlayerIndex].isFainted = true;
        setPlayerTeam(newPlayerTeam);
      }
      
      addToLog(`${defender.name} desmaiou!`);
      return true;
    }
    return false;
  };

  const onPlayerMove = (move: Move) => {
    if (gameState !== 'player_turn') return;
    const defenderFainted = handleAttack(activePlayerPokemon, activeOpponentPokemon, move, true);
    if (opponentTeam.every(p => p.isFainted)) {
      addToLog("Você venceu a batalha!");
      setGameState('finished');
      battleMusicRef.current?.stopAsync();
      victoryMusicRef.current?.replayAsync();
      return;
    }
    if (defenderFainted) {
      const nextOpponentIndex = opponentTeam.findIndex(p => !p.isFainted);
      if (nextOpponentIndex !== -1) {
        addToLog(`O oponente enviou ${opponentTeam[nextOpponentIndex].name}!`);
        setActiveOpponentIndex(nextOpponentIndex);
        setGameState('player_turn');
      }
    } else {
      setGameState('opponent_turn');
      setTimeout(() => onOpponentMove(), 1500);
    }
  };
  
  const onOpponentMove = () => {
    const randomMove = activeOpponentPokemon.moves[Math.floor(Math.random() * activeOpponentPokemon.moves.length)];
    const defenderFainted = handleAttack(activeOpponentPokemon, activePlayerPokemon, randomMove, false);
    if (playerTeam.every(p => p.isFainted)) {
      addToLog("Você perdeu a batalha!");
      setGameState('finished');
      battleMusicRef.current?.stopAsync();
      return;
    }
    if (defenderFainted) {
      setGameState('awaiting_switch');
      setShowSwitchMenu(true);
      addToLog("Escolha o seu próximo Pokémon!");
    } else {
      setGameState('player_turn');
    }
  };

  const handleSwitch = (index: number) => {
    if (playerTeam[index].isFainted || index === activePlayerIndex) return;
    const oldPokemonName = activePlayerPokemon.name;
    setActivePlayerIndex(index);
    setShowSwitchMenu(false);
    if (gameState === 'awaiting_switch') {
        addToLog(`Vai, ${playerTeam[index].name}!`);
        setGameState('player_turn');
    } else {
        addToLog(`${oldPokemonName}, volte! Vai, ${playerTeam[index].name}!`);
        setGameState('opponent_turn');
        setTimeout(() => onOpponentMove(), 1500);
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
                <TouchableOpacity key={move.name} style={styles.actionButton} onPress={() => onPlayerMove(move)} disabled={gameState !== 'player_turn'}>
                    <Text style={styles.actionText}>{move.name}</Text>
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
                <Text style={styles.nameText}>{activeOpponentPokemon.name}</Text>
                <HealthBar currentHp={activeOpponentPokemon.currentHp} maxHp={activeOpponentPokemon.maxHp} />
            </View>
            <Image source={{ uri: activeOpponentPokemon.sprites.front_default }} style={styles.sprite} />
        </View>
        <View style={styles.pokemonContainer}>
            <Image source={{ uri: activePlayerPokemon.sprites.back_default }} style={styles.sprite} />
             <View style={styles.infoBox}>
                <Text style={styles.nameText}>{activePlayerPokemon.name}</Text>
                <HealthBar currentHp={activePlayerPokemon.currentHp} maxHp={activePlayerPokemon.maxHp} />
            </View>
        </View>
        <View style={styles.teamContainer}>
            {playerTeam.map((p, i) => <TeamIcon key={p.id} pokemon={p} isActive={i === activePlayerIndex} />)}
        </View>
      </View>
      <View style={styles.controlsContainer}>
        <View style={styles.logContainer}>
            <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}>
                {battleLog.slice(0, 5).map((msg, index) => <Text key={index} style={styles.logText}>{msg}</Text>)}
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
    nameText: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 5 },
    healthBarContainer: { height: 15, backgroundColor: '#555', borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
    healthBar: { height: '100%', borderRadius: 10 },
    hpText: { position: 'absolute', alignSelf: 'center', color: 'white', fontWeight: 'bold', fontSize: 10 },
    sprite: { width: 140, height: 140, resizeMode: 'contain' },
    teamContainer: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 10 },
    teamIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#555', marginHorizontal: 2, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
    activeTeamIcon: { borderColor: '#FFCB05' },
    faintedIcon: { opacity: 0.4 },
    teamIconSprite: { width: 40, height: 40 },
    controlsContainer: { flex: 2, borderTopWidth: 4, borderColor: '#000', flexDirection: 'row' },
    logContainer: { flex: 1.2, backgroundColor: 'rgba(0,0,0,0.3)', padding: 10 },
    logText: { color: 'white', fontSize: 14, marginBottom: 5 },
    actionsPanel: { flex: 1, padding: 5, justifyContent: 'center', flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center' },
    actionButton: { backgroundColor: '#4a4a4a', borderRadius: 10, padding: 10, margin: 4, width: '45%', minHeight: 50, alignItems: 'center', justifyContent: 'center' },
    disabledButton: { backgroundColor: '#333', opacity: 0.6 },
    actionText: { color: 'white', fontWeight: 'bold', textTransform: 'capitalize', textAlign: 'center' },
    switchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4a4a4a', borderRadius: 10, padding: 5, margin: 4, width: '45%' },
    switchSprite: { width: 40, height: 40 },
    switchInfo: { marginLeft: 10, flex: 1 },
    switchName: { color: 'white', fontWeight: 'bold' },
    switchHp: { color: '#ccc', fontSize: 12 },
    backButton: { backgroundColor: '#757575' },
});
