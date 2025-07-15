import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
interface Pokemon {
  name: string;
  image: string;
}
interface PokemonAPIResponse {
  name: string;
  sprites: {
    other: {
      'official-artwork': {
        front_default: string;
      };
    };
  };
}
const POKEMON_COUNT = 898;
export default function GameScreen() {
  const [sound, setSound] = useState<Audio.Sound | undefined>();
  const [correctPokemon, setCorrectPokemon] = useState<Pokemon | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  const [message, setMessage] = useState('');
  const [score, setScore] = useState(0);
  const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const playSound = async () => {
    try {
      if (sound) await sound.replayAsync();
    } catch (e) {
      console.log('Erro ao tocar o som', e);
    }
  };
  const fetchPokemonData = useCallback(async () => {
    setIsLoading(true);
    setIsRevealed(false);
    setMessage('');
    try {
      const randomIds = new Set<number>();
      while (randomIds.size < 4) {
        randomIds.add(Math.floor(Math.random() * POKEMON_COUNT) + 1);
      }
      const ids = Array.from(randomIds);
      const requests = ids.map(id => fetch(`https://pokeapi.co/api/v2/pokemon/${id}`));
      const responses = await Promise.all(requests);
      const pokemonData: PokemonAPIResponse[] = await Promise.all(responses.map(res => res.json()));
      const correct = pokemonData[0];
      setCorrectPokemon({
        name: correct.name,
        image: correct.sprites.other['official-artwork'].front_default,
      });
      const shuffledOptions = pokemonData.map(p => capitalize(p.name)).sort(() => Math.random() - 0.5);
      setOptions(shuffledOptions);
      playSound();
    } catch (error) {
      console.error("Erro ao procurar Pokémon:", error);
      setMessage('Não foi possível carregar o Pokémon. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [sound]);

  useEffect(() => {
    const loadSound = async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
               require('../assets/quem.mp3'),
               { shouldPlay: false }
            );
            setSound(sound);
        } catch (e) {
            console.error("Falha ao carregar o som local.", e);
        }
    }
    loadSound();
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (sound) fetchPokemonData();
  }, [sound]);

  const handleOptionPress = (option: string) => {
    if (isRevealed || !correctPokemon) return;
    setIsRevealed(true);
    if (option.toLowerCase() === correctPokemon.name) {
      setMessage('Correto!');
      setScore(prevScore => prevScore + 1);
    } else {
      setMessage(`Incorreto! O Pokémon era ${capitalize(correctPokemon.name)}.`);
    }
  };

  const handleNextPokemon = () => {
    fetchPokemonData();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Botão de Voltar */}
      <Link href="/" asChild>
        <TouchableOpacity style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFCB05" />
            <Text style={styles.backButtonText}>Menu</Text>
        </TouchableOpacity>
      </Link>

      <View style={styles.header}>
        <Text style={styles.title}>Quem é esse Pokémon?</Text>
        <Text style={styles.score}>Pontuação: {score}</Text>
      </View>

      <View style={styles.gameArea}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#FFCB05" />
        ) : correctPokemon ? (
          <>
            <Image
              source={{ uri: correctPokemon.image }}
              style={[styles.pokemonImage, !isRevealed && styles.silhouette]}
            />
            {isRevealed && <Text style={styles.pokemonName}>{capitalize(correctPokemon.name)}</Text>}
          </>
        ) : null}
      </View>

      <View style={styles.controlsArea}>
        {isRevealed && <Text style={styles.message}>{message}</Text>}
        <View style={styles.optionsContainer}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionButton,
                isRevealed && correctPokemon && option.toLowerCase() === correctPokemon.name && styles.correctOption,
                isRevealed && correctPokemon && option.toLowerCase() !== correctPokemon.name && styles.incorrectOption
              ]}
              onPress={() => handleOptionPress(option)}
              disabled={isRevealed}
            >
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {isRevealed && (
            <TouchableOpacity style={styles.nextButton} onPress={handleNextPokemon}>
                <Text style={styles.nextButtonText}>Próximo Pokémon</Text>
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#3B4CCA', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
    header: { width: '100%', alignItems: 'center', paddingVertical: 5 },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFCB05',
        marginBottom: 10,
        ...Platform.select({
            web: {
                textShadow: '2px 2px 3px #000',
            },
            default: {
                textShadowColor: '#000',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 3,
            }
        })
    },
    score: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    gameArea: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
    pokemonImage: { width: 250, height: 250, resizeMode: 'contain' },
    silhouette: { tintColor: 'black' },
    pokemonName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 10, textTransform: 'capitalize' },
    controlsArea: { width: '100%', alignItems: 'center', paddingBottom: 20 },
    message: { fontSize: 18, color: '#fff', fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
    optionButton: { backgroundColor: '#f0f0f0', paddingVertical: 15, paddingHorizontal: 10, borderRadius: 10, margin: 5, width: '45%', alignItems: 'center', borderWidth: 2, borderColor: '#c0c0c0' },
    optionText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    correctOption: { backgroundColor: '#4CAF50', borderColor: '#388E3C' },
    incorrectOption: { backgroundColor: '#f44336', borderColor: '#D32F2F', opacity: 0.7 },
    nextButton: { marginTop: 20, backgroundColor: '#FFCB05', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, borderWidth: 2, borderColor: '#C7A008' },
    nextButtonText: { fontSize: 18, fontWeight: 'bold', color: '#3B4CCA' },
    backButton: { position: 'absolute', top: 50, left: 20, zIndex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 10 },
    backButtonText: { color: '#FFCB05', fontSize: 16, marginLeft: 5, fontWeight: 'bold' },
});
