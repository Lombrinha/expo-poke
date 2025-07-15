import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, SafeAreaView, StatusBar, Platform } from 'react-native';
import { Link } from 'expo-router';
export default function MainMenu() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Image 
          source={ require('../assets/download.jpg') } 
          style={styles.logo}
        />
        <Text style={styles.title}>PokéApp</Text>
        <Text style={styles.subtitle}>Escolha a sua aventura!</Text>
      </View>
      <View style={styles.menuContainer}>
        <Link href="/game" asChild>
          <TouchableOpacity style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Quem é esse Pokémon?</Text>
          </TouchableOpacity>
        </Link>
        <Link href="/pokedex" asChild>
          <TouchableOpacity style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Pokédex</Text>
          </TouchableOpacity>
        </Link>
        <Link href="/memory" asChild>
          <TouchableOpacity style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Jogo da Memória</Text>
          </TouchableOpacity>
        </Link>
        <Link href="/race" asChild>
          <TouchableOpacity style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Corrida de Pokémon</Text>
          </TouchableOpacity>
        </Link>
        {/* NOVO: Botão para a Rinha de Pokémon */}
        <Link href="/battle" asChild>
          <TouchableOpacity style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Rinha de Pokémon</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3B4CCA', alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 60 },
  logo: { width: 200, height: 80, resizeMode: 'contain', marginBottom: 20 },
  title: {
    fontSize: 48, fontWeight: 'bold', color: '#FFCB05',
    ...Platform.select({
      web: { textShadow: '2px 2px 3px #000000' },
      default: { textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 3 },
    })
  },
  subtitle: { fontSize: 18, color: '#fff', marginTop: 10 },
  menuContainer: { width: '80%' },
  menuButton: {
    backgroundColor: '#FFCB05', paddingVertical: 20, borderRadius: 15, alignItems: 'center',
    marginBottom: 20, borderWidth: 3, borderColor: '#C7A008', elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 3,
  },
  pokedexButton: { backgroundColor: '#CC0000', borderColor: '#8B0000' },
  memoryButton: { backgroundColor: '#4CAF50', borderColor: '#388E3C' },
  raceButton: { backgroundColor: '#f44336', borderColor: '#D32F2F' },
  battleButton: { backgroundColor: '#673AB7', borderColor: '#512DA8' },
  menuButtonText: {
    fontSize: 20, fontWeight: 'bold', color: '#fff',
    ...Platform.select({
      web: { textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)' },
      default: { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
    })
  },
});
