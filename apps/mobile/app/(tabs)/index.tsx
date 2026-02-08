import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth-context';

export default function DashboardScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Welcome, {user?.user_metadata?.full_name || 'there'}!
      </Text>
      <Text style={styles.subtitle}>Your BattersUp dashboard</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>No league membership yet</Text>
        <Text style={styles.cardText}>
          Ask your league commissioner for a signup code to join a league.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 16, color: '#6b7280', marginTop: 4 },
  card: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  cardText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
});
